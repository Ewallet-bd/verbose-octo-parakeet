<?php
// হেডার ফাইলটি অন্তর্ভুক্ত করি (এটিতেই লগইন চেক ও মেন্যু আছে)
include 'customer_header.php';

$success_message = '';
$error_message = '';

// সেশন থেকে কাস্টমার ID নিন
$customer_id = $_SESSION['customer_id'];

// --- PHP: প্রোফাইল আপডেট করার লজিক ---
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['update_profile'])) {
    
    // ফর্ম থেকে ডেটা নিন
    $full_name = $_POST['full_name'];
    $mg_email = $_POST['mg_email'];
    $mg_wallet = $_POST['mg_wallet'];

    // `customers` টেবিল আপডেট করুন
    $sql_update = "UPDATE customers SET full_name = ?, mg_email = ?, mg_wallet = ? WHERE id = ?";
    $stmt_update = $mysqli->prepare($sql_update);
    $stmt_update->bind_param("sssi", $full_name, $mg_email, $mg_wallet, $customer_id);
    
    if ($stmt_update->execute()) {
        $success_message = "আপনার প্রোফাইল সফলভাবে আপডেট করা হয়েছে।";
        // সেশনের নামটি আপডেট করুন (যদি নাম পরিবর্তন করা হয়)
        $_SESSION['customer_full_name'] = $full_name;
    } else {
        // ইমেল ডুপ্লিকেট হলে এই এরর দেখাবে
        if ($mysqli->errno == 1062) {
            $error_message = "এই Money Go ইমেলটি ইতিমধ্যেই অন্য অ্যাকাউন্টে ব্যবহৃত হয়েছে।";
        } else {
            $error_message = "প্রোফাইল আপডেট করার সময় একটি ত্রুটি ঘটেছে: " . $stmt_update->error;
        }
    }
    $stmt_update->close();
}

// --- PHP: কাস্টমারের বর্তমান তথ্য আনুন ---
$sql_get = "SELECT full_name, mg_email, mg_wallet FROM customers WHERE id = ?";
$stmt_get = $mysqli->prepare($sql_get);
$stmt_get->bind_param("i", $customer_id);
$stmt_get->execute();
$result = $stmt_get->get_result();
$customer = $result->fetch_assoc();
$stmt_get->close();

?>

<div class="card" style="max-width: 600px; margin: auto;">
    <div class="card-header">
        <h2>আমার প্রোফাইল</h2>
    </div>
    <div class="card-body">
        
        <?php if ($success_message): ?>
            <div class="alert alert-success"><?php echo $success_message; ?></div>
        <?php endif; ?>
        <?php if ($error_message): ?>
            <div class="alert alert-danger"><?php echo $error_message; ?></div>
        <?php endif; ?>

        <form action="customer_profile.php" method="POST">
            <div class="form-group">
                <label for="full_name">পূর্ণ নাম:</label>
                <input type="text" id="full_name" name="full_name" value="<?php echo htmlspecialchars($customer['full_name']); ?>" required>
            </div>
            <div class="form-group">
                <label for="mg_email">Money Go ইমেল:</label>
                <input type="email" id="mg_email" name="mg_email" value="<?php echo htmlspecialchars($customer['mg_email']); ?>">
            </div>
            <div class="form-group">
                <label for="mg_wallet">Money Go ওয়ালেট:</label>
                <input type="text" id="mg_wallet" name="mg_wallet" value="<?php echo htmlspecialchars($customer['mg_wallet']); ?>">
            </div>
            
            <button type="submit" name="update_profile" class="btn btn-success">তথ্য আপডেট করুন</button>
            <a href="customer_dashboard.php" class="btn" style="background-color: #6c757d; color: white;">ড্যাশবোর্ডে ফিরে যান</a>
        </form>
    </div>
</div>

<?php
// ফুটার ফাইলটি অন্তর্ভুক্ত করি
include 'customer_footer.php';
?>