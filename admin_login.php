<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>অ্যাডমিন লগইন</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f0f2f5;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }
        .login-container {
            background-color: #ffffff;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            width: 300px;
            text-align: center;
        }
        .login-container h2 {
            margin-bottom: 1.5rem;
            color: #333;
        }
        .login-container input[type="text"],
        .login-container input[type="password"] {
            width: 100%;
            padding: 0.75rem;
            margin-bottom: 1rem;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box; /* Important */
        }
        .login-container input[type="submit"] {
            width: 100%;
            padding: 0.75rem;
            background-color: #007bff;
            border: none;
            border-radius: 4px;
            color: white;
            font-size: 1rem;
            font-weight: bold;
            cursor: pointer;
            transition: background-color 0.3s ease;
        }
        .login-container input[type="submit"]:hover {
            background-color: #0056b3;
        }
        .error-message {
            color: red;
            margin-bottom: 1rem;
        }
    </style>
</head>
<body>
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