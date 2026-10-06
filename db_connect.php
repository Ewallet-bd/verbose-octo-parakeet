<?php
/*
  আপনার Cpanel-এ তৈরি করা ডাটাবেসের আসল তথ্য এখানে দিন।
*/
$db_host = 'localhost';          // সাধারণত 'localhost' থাকে
$db_user = 'hisaqcis_mg';       // Cpanel-এর ইউজারনেম
$db_pass = '81454867@Hasan@';  // Cpanel-এর পাসওয়ার্ড
$db_name = 'hisaqcis_mg';     // Cpanel-এ যে নামে ডাটাবেস করেছেন

// MySQLi দিয়ে সংযোগ স্থাপন
$mysqli = new mysqli($db_host, $db_user, $db_pass, $db_name);

// সংযোগ পরীক্ষা করুন
if ($mysqli->connect_error) {
    die('Connect Error (' . $mysqli->connect_errno . ') ' . $mysqli->connect_error);
}

// UTF-8 এনকোডিং সেট করুন (বাংলা সাপোর্টের জন্য)
$mysqli->set_charset("utf8mb4");


/**
 * নতুন কাস্টম আইডি জেনারেট করার ফাংশন
 * এটি ট্রানজেকশনের ভেতরে ব্যবহার করা নিরাপদ
 * ব্যবহার: getNextCustomID('PPID', $mysqli);
 */
function getNextCustomID($prefix, $mysqli) {
    // ১. বর্তমান আইডি লক করুন এবং ১ বৃদ্ধি করুন
    $mysqli->query("UPDATE id_counters SET last_id = last_id + 1 WHERE prefix = '$prefix'");
    
    // ২. নতুন আইডিটি আনুন
    $result = $mysqli->query("SELECT last_id FROM id_counters WHERE prefix = '$prefix'");
    
    if ($result && $result->num_rows > 0) {
        $new_id_number = $result->fetch_assoc()['last_id'];
        // ৩. "PPID" এবং নম্বর (e.g., 1001) একত্রিত করে রিটার্ন করুন
        return $prefix . $new_id_number;
    } else {
        // যদি কোনো কারণে `id_counters` টেবিল কাজ না করে
        return $prefix . time(); // একটি ফলব্যাক আইডি
    }
}
?>