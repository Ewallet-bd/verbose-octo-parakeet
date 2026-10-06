<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// চেক করি যে 'customer_logged_in' সেশন ভেরিয়েবলটি true কিনা
if (!isset($_SESSION['customer_logged_in']) || $_SESSION['customer_logged_in'] !== true) {
    
    // যদি লগইন করা না থাকে, তাহলে লগইন পেজে (index.php) রিডাইরেক্ট করি
    header("Location: index.php");
    exit;
}
?>