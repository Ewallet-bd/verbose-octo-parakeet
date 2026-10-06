<?php
// অ্যাডমিন লগইন চেক
include 'auth_check.php';
include 'db_connect.php';

$order_id = $_GET['order_id'] ?? 0; // এটি ডাটাবেসের আসল ID (e.g., 8)

if ($order_id > 0) {
    
    // ১. অর্ডারটি খুঁজে বের করুন এবং এর কাস্টম OID আনুন
    $sql_get_order = "SELECT * FROM orders WHERE id = ? AND customer_commission_status = 'pending'";
    $stmt_get = $mysqli->prepare($sql_get_order);
    $stmt_get->bind_param("i", $order_id);
    $stmt_get->execute();
    $result_order = $stmt_get->get_result();

    if ($result_order->num_rows === 1) {
        $order = $result_order->fetch_assoc();
        
        $customer_id = $order['customer_id'];
        $customer_commission_usd = (float)$order['customer_commission'];
        $custom_oid = $order['custom_id']; // OID1008
        $date = date('Y-m-d');

        // ২. Transaction শুরু
        $mysqli->begin_transaction();
        try {
            // ক. অর্ডারের স্ট্যাটাস 'completed' করুন
            $sql_update_order = "UPDATE orders SET customer_commission_status = 'completed' WHERE id = ?";
            $stmt_update_order = $mysqli->prepare($sql_update_order);
            $stmt_update_order->bind_param("i", $order_id);
            $stmt_update_order->execute();

            // খ. কাস্টমারের ওয়ালেটে ৩% কমিশন যোগ করুন
            $sql_add_bonus = "UPDATE customers SET wallet_balance = wallet_balance + ? WHERE id = ?";
            $stmt_add_bonus = $mysqli->prepare($sql_add_bonus);
            $stmt_add_bonus->bind_param("di", $customer_commission_usd, $customer_id);
            $stmt_add_bonus->execute();
            
            // গ. `prepayments` টেবিলে এই বোনাসের একটি লগ এন্ট্রি করুন (নতুন বিবরণ সহ)
            $description = "কমিশন ({$custom_oid})"; // আপনার অনুরোধ করা বিবরণ
            $sql_log_bonus = "INSERT INTO prepayments 
                                (customer_id, date, payment_type, amount_paid, amount_credited, description)
                              VALUES (?, ?, 'commission_bonus', 0, ?, ?)";
            $stmt_log_bonus = $mysqli->prepare($sql_log_bonus);
            $stmt_log_bonus->bind_param("isds", $customer_id, $date, $customer_commission_usd, $description);
            $stmt_log_bonus->execute();

            // ঘ. সব সফল হলে কমিট করুন
            $mysqli->commit();
            header("Location: orders.php?success=1");

        } catch (mysqli_sql_exception $exception) {
            $mysqli->rollback();
            header("Location: orders.php?error=1&msg=" . urlencode($exception->getMessage()));
        }

    } else {
        header("Location: orders.php?error=1&msg=AlreadyCompleted");
    }
} else {
    header("Location: orders.php");
}
exit();
?>