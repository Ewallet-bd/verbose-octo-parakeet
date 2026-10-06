<?php
// ১. অথেন্টিকেশন এবং সেশন চেক
include 'customer_auth_check.php'; // এটি সেশন স্টার্ট করে
// ২. ডাটাবেস কানেকশন
include 'db_connect.php';

// ৩. চেক করি অ্যাডমিন এই প্যানেলটি দেখছে কিনা
$is_impersonating = (isset($_SESSION['impersonated_by_admin']) && $_SESSION['impersonated_by_admin'] === true);

// ৪. কাস্টমারের ধরন চেক (নতুন)
$customer_id_for_type_check = $_SESSION['customer_id'];
$sql_check_type = "SELECT payment_type FROM prepayments 
                   WHERE customer_id = ? 
                   AND payment_type IN ('portal_0', 'personal_0', 'portal_2.5', 'personal_2.5')
                   ORDER BY date DESC, id DESC LIMIT 1";
$stmt_check_type = $mysqli->prepare($sql_check_type);
$stmt_check_type->bind_param("i", $customer_id_for_type_check);
$stmt_check_type->execute();
$result_type = $stmt_check_type->get_result();
$is_0_percent_customer = false; // ডিফল্ট
if ($result_type->num_rows === 1) {
    $last_type = $result_type->fetch_assoc()['payment_type'];
    if ($last_type == 'portal_0' || $last_type == 'personal_0') {
        $is_0_percent_customer = true;
    }
}
$stmt_check_type->close();
?>
<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>কাস্টমার ড্যাশবোর্ড</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; background-color: #f4f7f6; }
        .header {
            background-color: #3498db; padding: 1rem 1.5rem; color: white;
            display: flex; justify-content: space-between; align-items: center;
        }
        .header h1 { margin: 0; font-size: 1.2rem; }
        .header .header-buttons { display: flex; align-items: center; flex-wrap: wrap; }
        .header .header-btn {
            color: white; background-color: #2980b9; padding: 0.5rem 0.8rem;
            text-decoration: none; border-radius: 4px; font-weight: bold; 
            margin-left: 0.5rem; font-size: 0.8rem; margin-top: 5px; margin-bottom: 5px;
        }
        .header .logout-btn { background-color: #e74c3c; }
        .header .admin-return-btn { color: black; background-color: #f1c40f; }
        .header .btn-info { background-color: #17a2b8; } 
        .header .btn-pending { background-color: #e67e22; }
        .header .btn-completed { background-color: #27ae60; }

        .container { padding: 2rem; }
        .card { background-color: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 2rem; }
        .card-header { padding: 1rem 1.5rem; border-bottom: 1px solid #eee; background-color: #f9f9f9; }
        .card-header h2 { margin: 0; font-size: 1.25rem; }
        .card-body { padding: 1.5rem; }
        table { width: 100%; border-collapse: collapse; }
        table th, table td { padding: 0.75rem; border: 1px solid #ddd; text-align: left; }
        table th { background-color: #f2f2f2; }
        
        .dashboard-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 1.5rem; margin-bottom: 2rem;
        }
        .stat-card {
            background-color: #ffffff; padding: 1.5rem; border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.05);
        }
        .stat-card h3 { margin: 0 0 0.5rem 0; font-size: 1rem; color: #555; }
        .stat-card .value { font-size: 2rem; font-weight: bold; color: #333; }
        .stat-card.balance { border-left: 5px solid #2ecc71; }
        .stat-card.prepayment { border-left: 5px solid #3498db; }
        .stat-card.order-usd { border-left: 5px solid #e74c3c; }
        .stat-card.order-bdt { border-left: 5px solid #f39c12; }

        .filter-form {
            display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-end;
        }
        .filter-form .form-group { margin-bottom: 0; flex: 1; min-width: 200px; }
        .form-group label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
        .form-group input, .form-group select {
            width: 100%; padding: 0.75rem; border: 1px solid #ddd;
            border-radius: 4px; box-sizing: border-box;
        }
        .btn {
            padding: 0.75rem 1.5rem; border: none; border-radius: 4px;
            color: white; font-weight: bold; cursor: pointer;
        }
        .btn-primary { background-color: #3498db; }
        .btn-primary:hover { background-color: #2980b9; }
        .btn-success { background-color: #2ecc71; }

        .pagination {
            margin-top: 1.5rem; text-align: center;
        }
        .pagination a {
            color: #3498db; padding: 0.5rem 1rem; text-decoration: none;
            border: 1px solid #ddd; margin: 0 2px; border-radius: 4px;
        }
        .pagination a.active {
            background-color: #3498db; color: white; border-color: #3498db;
        }
        .pagination a:hover { background-color: #f4f4f4; }
        
        .alert {
            padding: 1rem; border-radius: 4px; margin-bottom: 1rem;
        }
        .alert-success { background-color: #d4edda; color: #155724; }
        .alert-danger { background-color: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <div class="header">
        <h1>কাস্টমার প্যানেল (<?php echo htmlspecialchars($_SESSION['customer_full_name']); ?>)</h1>
        <div class="header-buttons">
            
            <?php if ($is_impersonating): // যদি অ্যাডমিন লগইন করা থাকে ?>
                <a href="return_to_admin.php" class="header-btn admin-return-btn">অ্যাডমিনে ফেরত যান</a>
            <?php endif; // --- 'C' সরানো হয়েছে --- ?>
            <a href="customer_dashboard.php" class="header-btn">ড্যাশবোর্ড</a>
            <a href="customer_statement.php" class="header-btn btn-info">স্টেটমেন্ট</a>
            
            <?php if ($is_0_percent_customer): ?>
            <a href="customer_pending_comm.php" class="header-btn btn-pending">পেন্ডিং কমিশন</a>
            <a href="customer_completed_comm.php" class="header-btn btn-completed">কমপ্লিট কমিশন</a>
            <?php endif; ?>
            
            <a href="customer_profile.php" class="header-btn">আমার প্রোফাইল</a>
            <a href="customer_change_password.php" class="header-btn">পাসওয়ার্ড</a>
            <a href="logout.php" class="header-btn logout-btn">লগআউট</a>
        </div>
    </div>
    <div class="container">