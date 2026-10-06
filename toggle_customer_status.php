<?php
// অ্যাডমিন লগইন চেক
include 'auth_check.php';
include 'db_connect.php';

// URL থেকে তথ্য নিই
$user_id = $_GET['user_id'] ?? 0;
$current_status = $_GET['status'] ?? '';

if ($user_id > 0 && ($current_status == 'active' || $current_status == 'banned')) {
    
    // স্ট্যাটাসটি উল্টে দিই
    $new_status = ($current_status == 'active') ? 'banned' : 'active';

    // ডাটাবেস আপডেট করি
    $sql = "UPDATE users SET status = ? WHERE id = ?";
    $stmt = $mysqli->prepare($sql);
    $stmt->bind_param("si", $new_status, $user_id);
    
    if ($stmt->execute()) {
        // সফল হলে, কাস্টমার পেজে ফেরত পাঠাই
        header("Location: customers.php?status_updated=1");
    } else {
        // ব্যর্থ হলে
        header("Location: customers.php?status_error=1");
    }
    $stmt->close();
    $mysqli->close();

} else {
    // ভুল তথ্য আসলে
    header("Location: customers.php");
}
exit();
?>