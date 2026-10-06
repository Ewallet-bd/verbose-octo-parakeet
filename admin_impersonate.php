<?php
// ১. অ্যাডমিন লগইন চেক (সবচেয়ে গুরুত্বপূর্ণ)
// এই ফাইলটি শুধুমাত্র অ্যাডমিনরাই অ্যাক্সেস করতে পারবে
include 'auth_check.php'; // auth_check.php অ্যাডমিন সেশন স্টার্ট করে দেয়
include 'db_connect.php';

// ২. অ্যাডমিনের বর্তমান সেশন আইডি একটি ভেরিয়েবলে সেভ করে রাখি
$admin_session_data = $_SESSION;

// ৩. URL থেকে কাস্টমারের `user_id` নিই
$user_id_to_impersonate = $_GET['user_id'] ?? 0;

if ($user_id_to_impersonate > 0) {
    
    // ৪. ওই `user_id` ব্যবহার করে কাস্টমারের সব তথ্য বের করি (লগইনের জন্য যা যা লাগে)
    $sql = "SELECT users.id, customers.id AS customer_id, customers.full_name
            FROM users
            JOIN customers ON users.id = customers.user_id
            WHERE users.id = ? AND users.role = 'customer'";
    
    $stmt = $mysqli->prepare($sql);
    $stmt->bind_param("i", $user_id_to_impersonate);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 1) {
        $customer_data = $result->fetch_assoc();

        // ৫. বর্তমান (অ্যাডমিন) সেশনটি সম্পূর্ণ ধ্বংস করি
        session_destroy();

        // ৬. একটি নতুন সেশন শুরু করি (কাস্টমারের জন্য)
        session_start();

        // ৭. কাস্টমার হিসেবে সেশন ভেরিয়েবলগুলো সেট করি
        $_SESSION['customer_logged_in'] = true;
        $_SESSION['customer_user_id'] = $customer_data['id']; // users table id
        $_SESSION['customer_id'] = $customer_data['customer_id']; // customers table id
        $_SESSION['customer_full_name'] = $customer_data['full_name'];

        // ৮. একটি বিশেষ সেশন ভেরিয়েবল সেট করি, যাতে বোঝা যায় এটি অ্যাডমিন দেখছে
        // (এটি ব্যবহার করে আমরা কাস্টমার প্যানেলে "অ্যাডমিনে ফেরত যান" বাটন দেখাতে পারবো)
        $_SESSION['impersonated_by_admin'] = true;
        $_SESSION['admin_original_session'] = $admin_session_data; // অ্যাডমিনের তথ্য এখানে সেভ করে রাখি

        // ৯. কাস্টমার ড্যাশবোর্ডে রিডাইরেক্ট করি
        header("Location: customer_dashboard.php");
        exit();

    } else {
        die("এই কাস্টমারকে খুঁজে পাওয়া যায়নি।");
    }
} else {
    die("ভুল ইউজার আইডি।");
}
?>