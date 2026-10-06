<?php
// হেডার ফাইলটি অন্তর্ভুক্ত করি
include 'admin_header.php';

$success_message = '';
$error_message = '';
$customer_id = $_GET['id'] ?? 0; // URL থেকে কাস্টমার ID নিন

// PHP: আপডেট ফর্ম সাবমিট করার লজিক
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['update_customer'])) {
    
    // ফর্ম থেকে ডেটা নিন
    $customer_id = $_POST['customer_id'];
    $full_name = $_POST['full_name'];
    $mg_email = $_POST['mg_email'];
    $mg_wallet = $_POST['mg_wallet'];
    $username = $_POST['username'];
    $password = $_POST['password']; // নতুন পাসওয়ার্ড (খালিও থাকতে পারে)

    // কাস্টমার ID-এর সাথে user_id খুঁজে বের করুন
    $user_id_result = $mysqli->query("SELECT user_id FROM customers WHERE id = $customer_id");
    $user_id = $user_id_result->fetch_assoc()['user_id'];

    // Transaction শুরু করুন
    $mysqli->begin_transaction();

    try {
        // ১. `customers` টেবিল আপডেট করুন
        $sql_customers = "UPDATE customers SET full_name = ?, mg_email = ?, mg_wallet = ? WHERE id = ?";
        $stmt_customers = $mysqli->prepare($sql_customers);
        $stmt_customers->bind_param("sssi", $full_name, $mg_email, $mg_wallet, $customer_id);
        $stmt_customers->execute();

        // ২. `users` টেবিল আপডেট করুন
        if (!empty($password)) {
            // যদি নতুন পাসওয়ার্ড দেওয়া হয়
            $hashed_password = password_hash($password, PASSWORD_DEFAULT);
            $sql_users = "UPDATE users SET username = ?, password = ? WHERE id = ?";
            $stmt_users = $mysqli->prepare($sql_users);
            $stmt_users->bind_param("ssi", $username, $hashed_password, $user_id);
        } else {
            // যদি পাসওয়ার্ড ফিল্ড খালি থাকে (পাসওয়ার্ড পরিবর্তন হবে না)
            $sql_users = "UPDATE users SET username = ? WHERE id = ?";
            $stmt_users = $mysqli->prepare($sql_users);
            $stmt_users->bind_param("si", $username, $user_id);
        }
        $stmt_users->execute();

        // ৩. উভয় সফল হলে, Transaction কমিট করুন
        $mysqli->commit();
        $success_message = "কাস্টমারের তথ্য সফলভাবে আপডেট করা হয়েছে।";

    } catch (mysqli_sql_exception $exception) {
        // ৪. কোনো একটি ফেইল হলে, রোলব্যাক করুন
        $mysqli->rollback();
        if ($mysqli->errno == 1062) {
            $error_message = "এই ইউজারনেম বা ইমেলটি bereits ব্যবহৃত হয়েছে।";
        } else {
            $error_message = "একটি ত্রুটি ঘটেছে: " . $exception->getMessage();
        }
    }
}


// PHP: পেজ লোড হওয়ার সময় কাস্টমারের বর্তমান তথ্য দেখানোর লজিক
if ($customer_id > 0) {
    $sql_get_customer = "SELECT c.id, c.full_name, c.mg_email, c.mg_wallet, u.username 
                         FROM customers c
                         JOIN users u ON c.user_id = u.id
                         WHERE c.id = ?";
    $stmt_get = $mysqli->prepare($sql_get_customer);
    $stmt_get->bind_param("i", $customer_id);
    $stmt_get->execute();
    $result_customer = $stmt_get->get_result();
    
    if ($result_customer->num_rows === 1) {
        $customer = $result_customer->fetch_assoc();
    } else {
        $error_message = "কাস্টমার খুঁজে পাওয়া যায়নি।";
        $customer = null; // কাস্টমার না থাকলে ফর্ম দেখাবো না
    }
} else {
    $error_message = "কোনো কাস্টমার আইডি সিলেক্ট করা হয়নি।";
    $customer = null;
}

?>

<div class="card">
    <div class="card-header">
        <h2>কাস্টমার এডিট করুন</h2>
    </div>
    <div class="card-body">
        
        <?php if ($success_message): ?>
            <div class="alert alert-success"><?php echo $success_message; ?> ( <a href="customers.php">তালিকায় ফিরে যান</a> )</div>
        <?php endif; ?>
        <?php if ($error_message): ?>
            <div class="alert alert-danger"><?php echo $error_message; ?></div>
        <?php endif; ?>

        <?php if ($customer): // যদি কাস্টমার খুঁজে পাওয়া যায়, তবেই ফর্ম দেখাও ?>
        <form action="edit_customer.php?id=<?php echo $customer_id; ?>" method="POST">
            <input type="hidden" name="customer_id" value="<?php echo $customer['id']; ?>">

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
            <hr>
            <h4>কাস্টমার লগইন তথ্য</h4>
            <div class="form-group">
                <label for="username">ইউজারনেম (লগইন করার জন্য):</label>
                <input type="text" id="username" name="username" value="<?php echo htmlspecialchars($customer['username']); ?>" required>
            </div>
            <div class="form-group">
                <label for="password">নতুন পাসওয়ার্ড:</label>
                <input type="password" id="password" name="password" placeholder="পাসওয়ার্ড পরিবর্তন না করতে চাইলে এটি খালি রাখুন">
            </div>
            
            <button type="submit" name="update_customer" class="btn btn-success">তথ্য আপডেট করুন</button>
            <a href="customers.php" class="btn btn-secondary">বাতিল</a>
        </form>
        <?php endif; ?>
    </div>
</div>

<?php
// ফুটার ফাইলটি অন্তর্ভুক্ত করি
include 'admin_footer.php';
?>