<?php
session_start(); // সেশন শুরু করি

// সেশনের সব ডেটা মুছে ফেলি
session_unset();

// সেশনটি ধ্বংস করি
session_destroy();

// লগইন পেজে (index.php) রিডাইরেক্ট করি
header("Location: index.php");
exit;
?>