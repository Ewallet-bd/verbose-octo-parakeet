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
    <style>
        body { font-family: Arial, sans-serif; margin: 0; background-color: #f4f7f6; }
        .header {
            background-color: #2c3e50; padding: 1rem 2rem; color: white;
            display: flex; justify-content: space-between; align-items: center;
        }
        .header h1 { margin: 0; font-size: 1.5rem; }
        .header .logout-btn {
            color: white; background-color: #e74c3c; padding: 0.5rem 1rem;
            text-decoration: none; border-radius: 4px; font-weight: bold;
        }
        .nav { background-color: #34495e; padding: 0.75rem 1rem; font-size: 0.9rem; } /* ফন্ট ছোট করা হয়েছে */
        .nav a {
            color: white; text-decoration: none; padding: 0.75rem 0.8rem; /* প্যাডিং কমানো হয়েছে */
            display: inline-block; font-weight: bold;
        }
        .nav a:hover, .nav a.active { background-color: #1abc9c; }
        .container { padding: 2rem; }
        
        /* ফর্ম এবং টেবিলের জন্য স্টাইল */
        .card { background-color: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 2rem; }
        .card-header { padding: 1rem 1.5rem; border-bottom: 1px solid #eee; background-color: #f9f9f9; }
        .card-header h2 { margin: 0; font-size: 1.25rem; }
        .card-body { padding: 1.5rem; }
        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
        .form-group input, .form-group select {
            width: 100%; padding: 0.75rem; border: 1px solid #ddd;
            border-radius: 4px; box-sizing: border-box;
        }
        /* Radio button স্টাইল */
        .radio-group label { font-weight: normal; margin-right: 1.5rem; }
        .radio-group input { width: auto; margin-right: 0.5rem; }
        
        .btn {
            padding: 0.75rem 1.5rem; border: none; border-radius: 4px;
            color: white; font-weight: bold; cursor: pointer;
        }
        .btn-success { background-color: #2ecc71; }
        .btn-success:hover { background-color: #27ae60; }
        .btn-primary { background-color: #3498db; }
        .btn-primary:hover { background-color: #2980b9; }
        .btn-warning { background-color: #f39c12; color: white; } 
        .btn-warning:hover { background-color: #e67e22; }
        .btn-info { background-color: #17a2b8; color: white; }
        .btn-info:hover { background-color: #138496; }
        
        table { width: 100%; border-collapse: collapse; }
        table th, table td {
            padding: 0.75rem; border: 1px solid #ddd;
            text-align: left;
        }
        table th { background-color: #f2f2f2; }
        .alert {
            padding: 1rem; border-radius: 4px; margin-bottom: 1rem;
        }
        .alert-success { background-color: #d4edda; color: #155724; }
        .alert-danger { background-color: #f8d7da; color: #721c24; }
    </style>
</head>
<body>

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