<?php
// সেশন শুরু করি (বা কন্টিনিউ করি)
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// চেক করি যে 'admin_logged_in' সেশন ভেরিয়েবলটি true কিনা
if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
    
    // যদি লগইন করা না থাকে, তাহলে লগইন পেজে রিডাইরেক্ট করি
    header("Location: admin_login.php");
    exit; // এখানে কোড শেষ করি
}

// যদি লগইন করা থাকে, তাহলে এই ফাইলের কাজ শেষ। পেজের বাকি অংশ লোড হবে।
?>