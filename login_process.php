<?php
// ১. সেশন শুরু করুন (লগইন মনে রাখার জন্য)
session_start();

// ২. ডাটাবেস কানেকশন ফাইল আনুন
include 'db_connect.php';

// ৩. ফর্ম থেকে ডেটা নিন
$username = $_POST['username'];
$password = $_POST['password'];

// ৪. SQL কোয়েরি (শুধুমাত্র 'admin' রোলের ইউজার খোঁজার জন্য)
$sql = "SELECT id, password FROM users WHERE username = ? AND role = 'admin'";

$stmt = $mysqli->prepare($sql);

if ($stmt) {
    $stmt->bind_param("s", $username);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 1) {
        // ইউজার পাওয়া গেছে, এখন পাসওয়ার্ড ভেরিফাই করুন
        $row = $result->fetch_assoc();
        
        if (password_verify($password, $row['password'])) {
            // পাসওয়ার্ড সঠিক!
            
            // সেশনে অ্যাডমিনের তথ্য সেভ করুন
            $_SESSION['admin_logged_in'] = true;
            $_SESSION['admin_id'] = $row['id'];
            $_SESSION['admin_username'] = $username;

            // অ্যাডমিন ড্যাশবোর্ডে পাঠিয়ে দিন
            header("Location: admin_dashboard.php"); // এই ফাইলটি আমরা পরে বানাবো
            exit();
            
        } else {
            // পাসওয়ার্ড ভুল
            header("Location: admin_login.php?error=1");
            exit();
        }
    } else {
        // ইউজার (অ্যাডমিন) পাওয়া যায়নি
        header("Location: admin_login.php?error=1");
        exit();
    }
    
    $stmt->close();
}
$mysqli->close();
?>