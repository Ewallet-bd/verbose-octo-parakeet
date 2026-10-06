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
    <style>
        body {
            font-family: Arial, sans-serif; background-color: #f0f2f5;
            display: flex; justify-content: center; align-items: center;
            height: 100vh; margin: 0;
        }
        .login-container {
            background-color: #ffffff; padding: 2rem; border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            width: 300px; text-align: center;
        }
        .login-container h2 { margin-bottom: 1.5rem; color: #333; }
        .login-container input[type="text"],
        .login-container input[type="password"] {
            width: 100%; padding: 0.75rem; margin-bottom: 1rem;
            border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;
        }
        .login-container input[type="submit"] {
            width: 100%; padding: 0.75rem; background-color: #3498db;
            border: none; border-radius: 4px; color: white;
            font-size: 1rem; font-weight: bold; cursor: pointer;
        }
        .login-container input[type="submit"]:hover { background-color: #2980b9; }
        .error-message { color: red; margin-bottom: 1rem; }
    </style>
</head>
<body>
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