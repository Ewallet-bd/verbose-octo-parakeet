<?php
session_start(); // সেশন শুরু করি

// সেশনের সব ডেটা মুছে ফেলি
session_unset();

// সেশনটি ধ্বংস করি
session_destroy();

// লগইন পেজে রিডাইরেক্ট করি
header("Location: admin_login.php");
exit;
?>