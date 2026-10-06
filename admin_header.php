<?php
// ১. অথেন্টিকেশন এবং সেশন চেক
include 'auth_check.php';
// ২. ডাটাবেস কানেকশন
include 'db_connect.php';
?>
<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>অ্যাডমিন প্যানেল</title>
    <link rel="stylesheet" href="assets/style.css">
</head>
<body class="admin">

    <div class="header">
        <h1>অ্যাডমিন প্যানেল</h1>
        <a href="admin_logout.php" class="logout-btn">লগআউট</a>
    </div>

    <div class="nav">
        <?php $currentPage = basename($_SERVER['SCRIPT_NAME']); ?>
        <a href="admin_dashboard.php" class="<?php echo ($currentPage == 'admin_dashboard.php') ? 'active' : ''; ?>">ড্যাশবোর্ড</a>
        <a href="customers.php" class="<?php echo ($currentPage == 'customers.php') ? 'active' : ''; ?>">কাস্টমার</a>
        <a href="prepayments.php" class="<?php echo ($currentPage == 'prepayments.php') ? 'active' : ''; ?>">প্রি-পেমেন্ট</a>
        <a href="orders.php" class="<?php echo ($currentPage == 'orders.php') ? 'active' : ''; ?>">অর্ডার</a>
        <a href="reconciliation.php" class="<?php echo ($currentPage == 'reconciliation.php') ? 'active' : ''; ?>">অ্যাডমিন হিসাব</a>
        
        <a href="pending_customer_comm.php" class="<?php echo ($currentPage == 'pending_customer_comm.php') ? 'active' : ''; ?>">পেন্ডিং কমিশন (৩%)</a>
        <a href="completed_customer_comm.php" class="<?php echo ($currentPage == 'completed_customer_comm.php') ? 'active' : ''; ?>">কমপ্লিট কমিশন (৩%)</a>
        
        <a href="change_password.php" class="<?php echo ($currentPage == 'change_password.php') ? 'active' : ''; ?>">পাসওয়ার্ড</a>

    </div>

    <div class="container">