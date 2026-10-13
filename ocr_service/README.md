# ওপেন-সোর্স PaddleOCR মাইক্রোসার্ভিস (Open-Source PaddleOCR Service)

এই সার্ভিসটি ব্যবহার করে আপনি **Google Gemini API লিমিট ও কোটার কোনো সীমাবদ্ধতা ছাড়াই সম্পূর্ণ আনলিমিটেড** স্ক্রিনশট ও ব্যাংকিং রিসিট প্রসেস করতে পারবেন।

---

## কেন PaddleOCR স্ক্রিনশট প্রসেসিংয়ের জন্য সেরা?
1. **১০০% ফ্রি ও ওপেন সোর্স**: কোনো Google API Key বা মাসিক বিলের প্রয়োজন নেই।
2. **কোনো লিমিট নেই (No Rate Limits)**: দিনে হাজার হাজার ট্রানজেকশন স্ক্রিনশট প্রসেস করলেও কোটা শেষ হবে না।
3. **উন্নত স্ক্রিনশট ও রিসিট রিকগনিশন**: ছোট ফন্ট, রোটেশন, বিকাশ/নগদ/রকেট/উপায় ট্রানজেকশন আইডি, অ্যামাউন্ট ও নাম্বার নির্ভুলভাবে ডিটেক্ট করতে সক্ষম।
4. **সম্পূর্ণ নিজস্ব সার্ভারে অফলাইন এক্সিকিউশন**: ডেটা প্রাইভেসির নিশ্চয়তা।

---

## কিভাবে চালাবেন (How to Run):

### অপশন ১: ডকার (Docker / Docker-Compose) - সবচেয়ে সহজ
```bash
cd ocr_service
docker compose up -d --build
```
সার্ভিসটি `http://localhost:5000` এ চালু হবে।

### অপশন ২: সরাসরি পাইথন দিয়ে (Python Virtual Environment)
```bash
cd ocr_service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

---

## প্রধান প্রজেক্টে কানেক্ট করার উপায়:
আপনার প্রজেক্টের `.env` ফাইলে নিচের লাইনটি যুক্ত করুন:
```env
PADDLE_OCR_URL="http://localhost:5000/ocr"
```
যদি রিমোট VPS বা অন্য সার্ভারে চলে:
```env
PADDLE_OCR_URL="http://your-server-ip:5000/ocr"
```

## হাইব্রিড ফলব্যাক (Smart Hybrid Fallback System):
সিস্টেম স্বয়ংক্রিয়ভাবে:
1. `PADDLE_OCR_URL` কনফিগার থাকলে PaddleOCR দিয়ে স্ক্রিনশট প্রসেস করে (আনলিমিটেড কোটা)।
2. Gemini OCR ব্যবহার করলেও Gemini-র কোটা বা রেট লিমিট শেষ হলে (Error 429 / Quota Exceeded) সাথে সাথে PaddleOCR-এ ফলব্যাক করে লেখা রিড করবে।
