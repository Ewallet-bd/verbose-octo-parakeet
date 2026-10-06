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
    <link rel="stylesheet" href="assets/style.css">
</head>
<body class="customer">
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