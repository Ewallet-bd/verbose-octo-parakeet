"""
PaddleOCR Open-Source Microservice for Screenshot & Receipt Processing
FastAPI microservice providing open-source, offline, unlimited OCR.
No external API keys or rate limits required.
"""

import os
import io
import base64
from typing import Optional, List
from fastapi import FastAPI, File, UploadFile, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
import numpy as np

try:
    from paddleocr import PaddleOCR
    # Initialize PaddleOCR with angle classification for rotated screenshots
    # lang='en' handles numbers, English, transaction IDs, phone numbers, amounts
    ocr_engine = PaddleOCR(use_angle_cls=True, lang='en', show_log=False)
except Exception as e:
    print(f"Warning: Failed to initialize PaddleOCR engine: {e}")
    ocr_engine = None

app = FastAPI(
    title="Open-Source PaddleOCR Service",
    description="Offline, high-precision OCR for screenshots and banking transactions",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Base64OCRRequest(BaseModel):
    image: str # Base64 encoded image string
    lang: Optional[str] = "en"

class OCRResponse(BaseModel):
    success: bool = True
    text: str
    lines: List[str] = []
    engine: str = "PaddleOCR"

@app.get("/health")
def health_check():
    return {
        "status": "healthy" if ocr_engine is not None else "degraded",
        "service": "PaddleOCR Microservice",
        "engine_loaded": ocr_engine is not None,
        "message": "PaddleOCR service is online and ready to process screenshots."
    }

def run_paddle_ocr(image_bytes: bytes) -> str:
    if ocr_engine is None:
        raise HTTPException(status_code=500, detail="PaddleOCR engine is not loaded on this server.")
    
    try:
        pil_image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        img_np = np.array(pil_image)
        
        # Run PaddleOCR inference
        result = ocr_engine.ocr(img_np, cls=True)
        
        extracted_lines = []
        if result and len(result) > 0 and result[0] is not None:
            for line in result[0]:
                if line and len(line) >= 2:
                    text_info = line[1]
                    if isinstance(text_info, (list, tuple)) and len(text_info) > 0:
                        text = str(text_info[0]).strip()
                        if text:
                            extracted_lines.append(text)
        
        full_text = "\n".join(extracted_lines)
        return full_text
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"OCR Processing failed: {str(err)}")

@app.post("/ocr")
async def process_ocr_upload(file: UploadFile = File(...)):
    """Accepts uploaded image file multipart/form-data"""
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty image file received.")
    
    extracted_text = run_paddle_ocr(contents)
    lines = [l for l in extracted_text.split("\n") if l.strip()]
    return {
        "success": True,
        "text": extracted_text,
        "lines": lines,
        "engine": "PaddleOCR"
    }

@app.post("/ocr/base64")
async def process_ocr_base64(payload: Base64OCRRequest):
    """Accepts Base64 encoded image"""
    raw_b64 = payload.image
    if "," in raw_b64:
        raw_b64 = raw_b64.split(",", 1)[1]
    
    try:
        image_bytes = base64.b64decode(raw_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Base64 image payload.")
    
    extracted_text = run_paddle_ocr(image_bytes)
    lines = [l for l in extracted_text.split("\n") if l.strip()]
    return {
        "success": True,
        "text": extracted_text,
        "lines": lines,
        "engine": "PaddleOCR"
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 5000))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
