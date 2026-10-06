<?php
include 'auth_check.php';
include 'db_connect.php';

$customer_id = $_GET['customer_id'] ?? 0;
$response = ['is_0_percent' => false];

if ($customer_id > 0) {
    // কাস্টমারের শেষ "আসল" প্রি-পেমেন্ট টাইপ চেক করি (অটো-জেনারেটেড লগ বাদে)
    $sql = "SELECT payment_type FROM prepayments 
            WHERE customer_id = ? 
            AND payment_type IN ('portal_0', 'personal_0', 'portal_2.5', 'personal_2.5')
            ORDER BY date DESC, id DESC LIMIT 1";
            
    $stmt = $mysqli->prepare($sql);
    $stmt->bind_param("i", $customer_id);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows === 1) {
        $last_type = $result->fetch_assoc()['payment_type'];
        // যদি "0%" টাইপের কাস্টমার হয়
        if ($last_type == 'portal_0' || $last_type == 'personal_0') {
            $response['is_0_percent'] = true;
        }
    }
    $stmt->close();
}

// JSON ফরম্যাটে রেসপন্স পাঠাই
header('Content-Type: application/json');
echo json_encode($response);
?>