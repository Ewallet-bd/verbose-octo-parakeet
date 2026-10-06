<?php
session_start();
include 'db_connect.php'; // আমাদের ডাটাবেস কানেকশন ফাইল

$username = $_POST['username'];
$password = $_POST['password'];

// SQL কোয়েরি (এখন 'status' কলামও চেক করবে)
$sql = "SELECT users.id, users.password, users.status, customers.id AS customer_id, customers.full_name
        FROM users
        JOIN customers ON users.id = customers.user_id
        WHERE users.username = ? AND users.role = 'customer'";

$stmt = $mysqli->prepare($sql);

if ($stmt) {
    $stmt->bind_param("s", $username);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 1) {
        $row = $result->fetch_assoc();
        
        // পাসওয়ার্ড ভেরিফাই
        if (password_verify($password, $row['password'])) {
            
            // পাসওয়ার্ড সঠিক, এখন স্ট্যাটাস চেক করুন
            if ($row['status'] == 'banned') {
                // ইউজার ব্যানড
                header("Location: index.php?error=2"); // 2 মানে ব্যানড
                exit();
            }

            // স্ট্যাটাস 'active', লগইন সফল
            $_SESSION['customer_logged_in'] = true;
            $_SESSION['customer_user_id'] = $row['id'];
            $_SESSION['customer_id'] = $row['customer_id'];
            $_SESSION['customer_full_name'] = $row['full_name'];

            header("Location: customer_dashboard.php");
            exit();
            
        } else {
            // পাসওয়ার্ড ভুল
            header("Location: index.php?error=1");
            exit();
        }
    } else {
        // কাস্টমার পাওয়া যায়নি
        header("Location: index.php?error=1");
        exit();
    }
    
    $stmt->close();
}
$mysqli->close();
?>