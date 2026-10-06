<?php
// হেডার ফাইলটি অন্তর্ভুক্ত করি (এটিতেই লগইন চেক ও মেন্যু আছে)
include 'customer_header.php';

$success_message = '';
$error_message = '';

// PHP: পাসওয়ার্ড পরিবর্তন করার লজিক
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['update_password'])) {
    
    // ফর্ম থেকে ডেটা নিন
    $old_password = $_POST['old_password'];
    $new_password = $_POST['new_password'];
    $confirm_password = $_POST['confirm_password'];

    // সেশন থেকে কাস্টমারের `users` টেবিলের ID নিন
    $customer_user_id = $_SESSION['customer_user_id'];

    // ১. চেক করুন নতুন পাসওয়ার্ড দুটি মিলেছে কিনা
    if ($new_password !== $confirm_password) {
        $error_message = "নতুন পাসওয়ার্ড এবং কনফার্ম পাসওয়ার্ড মেলেনি।";
    } 
    // ২. চেক করুন নতুন পাসওয়ার্ড যথেষ্ট শক্তিশালী কিনা
    elseif (strlen($new_password) < 6) {
        $error_message = "নতুন পাসওয়ার্ডটি অবশ্যই কমপক্ষে ৬ অক্ষরের হতে হবে।";
    } 
    else {
        // ৩. পুরাতন পাসওয়ার্ডটি সঠিক কিনা তা ডাটাবেস থেকে যাচাই করুন
        
        $sql_get_pass = "SELECT password FROM users WHERE id = ? AND role = 'customer'";
        $stmt_get = $mysqli->prepare($sql_get_pass);
        $stmt_get->bind_param("i", $customer_user_id);
        $stmt_get->execute();
        $result = $stmt_get->get_result();
        
        if ($result->num_rows === 1) {
            $row = $result->fetch_assoc();
            $hashed_password_from_db = $row['password'];

            // password_verify() দিয়ে হ্যাশ করা পাসওয়ার্ড চেক করুন
            if (password_verify($old_password, $hashed_password_from_db)) {
                // পুরাতন পাসওয়ার্ড সঠিক! এখন নতুন পাসওয়ার্ড হ্যাশ করে আপডেট করুন
                
                $new_hashed_password = password_hash($new_password, PASSWORD_DEFAULT);
                
                $sql_update = "UPDATE users SET password = ? WHERE id = ?";
                $stmt_update = $mysqli->prepare($sql_update);
                $stmt_update->bind_param("si", $new_hashed_password, $customer_user_id);
                
                if ($stmt_update->execute()) {
                    $success_message = "আপনার পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে।";
                } else {
                    $error_message = "পাসওয়ার্ড আপডেট করার সময় একটি ত্রুটি ঘটেছে।";
                }
                
            } else {
                // পুরাতন পাসওয়ার্ড ভুল
                $error_message = "আপনার পুরাতন পাসওয়ার্ডটি সঠিক নয়।";
            }
        } else {
            $error_message = "আপনার অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।";
        }
    }
}

?>

<div class="card" style="max-width: 600px; margin: auto;">
    <div class="card-header">
        <h2>পাসওয়ার্ড পরিবর্তন করুন</h2>
    </div>
    <div class="card-body">
        
        <?php if ($success_message): ?>
            <div class="alert alert-success"><?php echo $success_message; ?></div>
        <?php endif; ?>
        <?php if ($error_message): ?>
            <div class="alert alert-danger"><?php echo $error_message; ?></div>
        <?php endif; ?>

        <form action="customer_change_password.php" method="POST">
            <div class="form-group">
                <label for="old_password">পুরাতন পাসওয়ার্ড:</label>
                <input type="password" id="old_password" name="old_password" required>
            </div>
            <div class="form-group">
                <label for="new_password">নতুন পাসওয়ার্ড:</label>
                <input type="password" id="new_password" name="new_password" required>
            </div>
            <div class="form-group">
                <label for="confirm_password">নতুন পাসওয়ার্ড কনফার্ম করুন:</label>
                <input type="password" id="confirm_password" name="confirm_password" required>
            </div>
            
            <button type="submit" name="update_password" class="btn btn-success">পাসওয়ার্ড আপডেট করুন</button>
            <a href="customer_dashboard.php" class="btn" style="background-color: #6c757d; color: white;">ড্যাশবোর্ডে ফিরে যান</a>
        </form>
    </div>
</div>

<?php
// ফুটার ফাইলটি অন্তর্ভুক্ত করি
include 'customer_footer.php';
?>