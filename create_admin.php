<?php
// ১. ডাটাবেস কানেকশন ফাইলটি অন্তর্ভুক্ত করুন
include 'db_connect.php';

// ২. অ্যাডমিনের তথ্য
$admin_username = 'admin';
$admin_password = 'admin123'; // আপনি এটি পরিবর্তন করতে পারেন

// ৩. পাসওয়ার্ডকে সুরক্ষিতভাবে হ্যাশ (Hash) করুন
$hashed_password = password_hash($admin_password, PASSWORD_DEFAULT);

// ৪. ডাটাবেসে ইনসার্ট করার SQL কোয়েরি
$sql = "INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')";

// ৫. স্টেটমেন্ট প্রস্তুত করুন এবং রান করুন
$stmt = $mysqli->prepare($sql);
if ($stmt) {
    $stmt->bind_param("ss", $admin_username, $hashed_password);
    if ($stmt->execute()) {
        echo "<h1>অ্যাডমিন ইউজার 'admin' সফলভাবে তৈরি হয়েছে!</h1>";
        echo "<p>পাসওয়ার্ড: 'admin123'</p>";
        echo "<p><b>নিরাপত্তার জন্য, এখনই এই 'create_admin.php' ফাইলটি সার্ভার থেকে ডিলিট করে দিন।</b></p>";
    } else {
        echo "Error: " . $stmt->error;
    }
    $stmt->close();
} else {
    echo "Error preparing statement: " . $mysqli->error;
}

$mysqli->close();
?>