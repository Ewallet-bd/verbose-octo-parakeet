<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>অ্যাডমিন লগইন</title>
    <link rel="stylesheet" href="assets/style.css">
</head>
<body class="login-page">
    <div class="login-container">
        <h2>অ্যাডমিন লগইন</h2>

        <?php
        // যদি URL-এ error=1 থাকে, তাহলে ভুল বার্তা দেখাও
        if (isset($_GET['error']) && $_GET['error'] == 1) {
            echo '<p class="error-message">ভুল ইউজারনেম বা পাসওয়ার্ড।</p>';
        }
        ?>

        <form action="login_process.php" method="POST">
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