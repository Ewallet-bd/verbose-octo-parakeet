<?php
session_start();
if (isset($_SESSION['customer_logged_in']) && $_SESSION['customer_logged_in'] === true) {
    header("Location: customer_dashboard.php");
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>কাস্টমার লগইন</title>
    <link rel="stylesheet" href="assets/style.css">
</head>
<body class="login-page customer">
    <div class="login-container">
        <h2>কাস্টমার লগইন</h2>

        <?php
        if (isset($_GET['error']) && $_GET['error'] == 1) {
            echo '<p class="error-message">ভুল ইউজারনেম বা পাসওয়ার্ড।</p>';
        }
        // নতুন এরর মেসেজ
        if (isset($_GET['error']) && $_GET['error'] == 2) {
            echo '<p class="error-message">আপনার অ্যাকাউন্টটি সাসপেন্ড (ব্যান) করা হয়েছে।</p>';
        }
        ?>

        <form action="customer_login_process.php" method="POST">
            <div>
                <input type="text" name="username" placeholder="ইউজারনেম" required>
            </div>
            <div>
                <input type="password" name="password" placeholder="পাসওয়ার্ড" required>
            </div>
            <div>
                <input type="submit" value="লগইন করুন">
            </div>
        </form>
    </div>
</body>
</html>