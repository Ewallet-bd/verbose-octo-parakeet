<?php
// হেডার ফাইলটি অন্তর্ভুক্ত করি
include 'admin_header.php';

$success_message = '';
$error_message = '';

// --- PHP: ডিলিট কাস্টমার লজিক ---
if (isset($_GET['delete_user_id']) && !empty($_GET['delete_user_id'])) {
    $user_id_to_delete = (int)$_GET['delete_user_id'];
    $sql_delete = "DELETE FROM users WHERE id = ? AND role = 'customer'";
    $stmt_delete = $mysqli->prepare($sql_delete);
    $stmt_delete->bind_param("i", $user_id_to_delete);
    if ($stmt_delete->execute()) {
        if ($stmt_delete->affected_rows > 0) $success_message = "কাস্টমার এবং তার সমস্ত লেনদেন সফলভাবে ডিলিট করা হয়েছে।";
        else $error_message = "ডিলিট করার জন্য কাস্টমারকে খুঁজে পাওয়া যায়নি।";
    } else $error_message = "ডিলিট করার সময় ত্রুটি ঘটেছে: " . $stmt_delete->error;
    $stmt_delete->close();
}
// স্ট্যাটাস আপডেটের বার্তা
if (isset($_GET['status_updated'])) $success_message = "কাস্টমারের স্ট্যাটাস সফলভাবে পরিবর্তন করা হয়েছে।";
if (isset($_GET['status_error'])) $error_message = "স্ট্যাটাস পরিবর্তন করার সময় একটি ত্রুটি ঘটেছে।";
// --- PHP: নতুন কাস্টমার অ্যাড করার লজিক ---
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['add_customer'])) {
    $full_name = $_POST['full_name']; $mg_email = $_POST['mg_email']; $mg_wallet = $_POST['mg_wallet'];
    $username = $_POST['username']; $password = $_POST['password'];
    $hashed_password = password_hash($password, PASSWORD_DEFAULT);
    $mysqli->begin_transaction();
    try {
        $sql_users = "INSERT INTO users (username, password, role) VALUES (?, ?, 'customer')";
        $stmt_users = $mysqli->prepare($sql_users);
        $stmt_users->bind_param("ss", $username, $hashed_password);
        $stmt_users->execute();
        $new_user_id = $mysqli->insert_id;
        $sql_customers = "INSERT INTO customers (user_id, full_name, mg_email, mg_wallet, wallet_balance) VALUES (?, ?, ?, ?, 0.00)";
        $stmt_customers = $mysqli->prepare($sql_customers);
        $stmt_customers->bind_param("isss", $new_user_id, $full_name, $mg_email, $mg_wallet);
        $stmt_customers->execute();
        $mysqli->commit();
        $success_message = "নতুন কাস্টমার সফলভাবে যোগ করা হয়েছে।";
    } catch (mysqli_sql_exception $exception) {
        $mysqli->rollback();
        if ($mysqli->errno == 1062) $error_message = "এই ইউজারনেম বা ইমেলটি ইতিমধ্যেই ব্যবহৃত হয়েছে।";
        else $error_message = "একটি ত্রুটি ঘটেছে: " . $exception->getMessage();
    }
}
// PHP: সকল কাস্টমারের তালিকা
$sql_get_list = "SELECT c.id, c.user_id, c.full_name, c.mg_email, c.mg_wallet, c.wallet_balance, u.status 
                 FROM customers c
                 JOIN users u ON c.user_id = u.id
                 ORDER BY c.id DESC";
$result_customers = $mysqli->query($sql_get_list);
?>

<div class="card">
    <div class="card-header"><h2>নতুন কাস্টমার অ্যাড করুন</h2></div>
    <div class="card-body">
        <?php if ($success_message): ?><div class="alert alert-success"><?php echo $success_message; ?></div><?php endif; ?>
        <?php if ($error_message): ?><div class="alert alert-danger"><?php echo $error_message; ?></div><?php endif; ?>
        <form action="customers.php" method="POST">
            <div class="form-group"><label for="full_name">পূর্ণ নাম:</label><input type="text" id="full_name" name="full_name" required></div>
            <div class="form-group"><label for="mg_email">Money Go ইমেল:</label><input type="email" id="mg_email" name="mg_email"></div>
            <div class="form-group"><label for="mg_wallet">Money Go ওয়ালেট:</label><input type="text" id="mg_wallet" name="mg_wallet"></div>
            <hr><h4>কাস্টমার লগইন তথ্য</h4>
            <div class="form-group"><label for="username">ইউজারনেম:</label><input type="text" id="username" name="username" required></div>
            <div class="form-group"><label for="password">পাসওয়ার্ড:</label><input type="password" id="password" name="password" required></div>
            <button type="submit" name="add_customer" class="btn btn-success">কাস্টমার অ্যাড করুন</button>
        </form>
    </div>
</div>

<div class="card">
    <div class="card-header"><h2>সকল কাস্টমারের তালিকা</h2></div>
    <div class="card-body">
        <table style="font-size: 0.9rem;">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>নাম</th>
                    <th>MG ইমেল</th>
                    <th>ব্যালেন্স</th>
                    <th>স্ট্যাটাস</th>
                    <th>অ্যাকশন</th>
                </tr>
            </thead>
            <tbody>
                <?php
                if ($result_customers && $result_customers->num_rows > 0) {
                    while ($row = $result_customers->fetch_assoc()) {
                        $status_text = ''; $toggle_btn_text = ''; $toggle_btn_class = '';
                        if ($row['status'] == 'active') {
                            $status_text = '<span style="color: green; font-weight: bold;">Active</span>';
                            $toggle_btn_text = 'Banned'; $toggle_btn_class = 'btn-warning';
                        } else {
                            $status_text = '<span style="color: red; font-weight: bold;">Banned</span>';
                            $toggle_btn_text = 'Active'; $toggle_btn_class = 'btn-success';
                        }
                        echo "<tr>";
                        echo "<td>" . $row['id'] . "</td>";
                        echo "<td>" . htmlspecialchars($row['full_name']) . "</td>";
                        echo "<td>" . htmlspecialchars($row['mg_email']) . "</td>";
                        echo "<td>$" . number_format($row['wallet_balance'], 2) . "</td>";
                        echo "<td>" . $status_text . "</td>";
                        
                        // --- "স্টেটমেন্ট" বাটন সহ ---
                        echo '<td style="white-space: nowrap;">
                                <a href="customer_statement.php?id=' . $row['id'] . '" class="btn btn-info" style="padding: 0.4rem 0.6rem; font-size: 0.8rem;" target="_blank">স্টেটমেন্ট</a>
                                <a href="edit_customer.php?id=' . $row['id'] . '" class="btn btn-primary" style="padding: 0.4rem 0.6rem; font-size: 0.8rem;">এডিট</a>
                                <a href="admin_impersonate.php?user_id=' . $row['user_id'] . '" class="btn btn-success" style="padding: 0.4rem 0.6rem; font-size: 0.8rem;" target="_blank">প্যানেল দেখুন</a>
                                <a href="toggle_customer_status.php?user_id=' . $row['user_id'] . '&status=' . $row['status'] . '" 
                                   class="btn ' . $toggle_btn_class . '" style="padding: 0.4rem 0.6rem; font-size: 0.8rem; color: white;">' . $toggle_btn_text . '</a>
                                <a href="customers.php?delete_user_id=' . $row['user_id'] . '" class="btn" style="background-color: #e74c3c; color: white; padding: 0.4rem 0.6rem; font-size: 0.8rem;" 
                                   onclick="return confirm(\'সতর্কবার্তা! আপনি কি নিশ্চিত যে এই কাস্টমারকে ডিলিট করতে চান?\')">ডিলিট</a>
                              </td>';
                        echo "</tr>";
                    }
                } else {
                    echo "<tr><td colspan='6'>এখনও কোনো কাস্টমার অ্যাড করা হয়নি।</td></tr>";
                }
                ?>
            </tbody>
        </table>
    </div>
</div>

<?php
include 'admin_footer.php';
?>