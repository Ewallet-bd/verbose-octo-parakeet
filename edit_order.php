<?php
include 'admin_header.php';

$success_message = '';
$error_message = '';
$order_id = $_GET['id'] ?? 0; // এটি ডাটাবেসের আসল ID

// --- PHP: আপডেট ফর্ম সাবমিট করার লজিক ---
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['update_order'])) {
    
    $order_id = (int)$_POST['order_id'];
    $new_amount_usd = (float)$_POST['amount_usd'];
    $new_bdt_amount = (float)$_POST['bdt_amount']; // BDT অমাউন্ট নেওয়া হলো
    $new_date = $_POST['date'];

    // MG রেট স্বয়ংক্রিয়ভাবে গণনা
    $new_mg_rate = 0;
    if ($new_amount_usd > 0) {
        $new_mg_rate = $new_bdt_amount / $new_amount_usd;
    }
    $new_bdt_amount_rounded = round($new_bdt_amount, 2);

    // ১. আপডেটের আগে, এই এন্ট্রির *পুরাতন* তথ্য আনুন
    $sql_get_old = "SELECT customer_id, amount_usd FROM orders WHERE id = ?";
    $stmt_get_old = $mysqli->prepare($sql_get_old);
    $stmt_get_old->bind_param("i", $order_id);
    $stmt_get_old->execute();
    $result_old = $stmt_get_old->get_result();
    
    if ($result_old->num_rows === 1) {
        $old_data = $result_old->fetch_assoc();
        $customer_id = $old_data['customer_id'];
        $old_amount_usd = (float)$old_data['amount_usd'];

        // ২. নতুন ডেটা দিয়ে নতুন হিসাব গণনা (কমিশন পুনরায় গণনা)
        // (এখানে অ্যাডমিন ফি পুনরায় গণনা করা হচ্ছে না, কারণ এটি খুবই জটিল হবে। শুধু মূল অর্ডার এডিট করা হচ্ছে)
        $new_admin_commission = 0.00;
        $new_customer_commission = 0.00;
        $new_customer_commission_status = 'completed';

        $sql_check_type = "SELECT payment_type FROM prepayments WHERE customer_id = ? AND payment_type IN ('portal_0', 'personal_0', 'portal_2.5', 'personal_2.5') ORDER BY date DESC, id DESC LIMIT 1";
        $stmt_check_type = $mysqli->prepare($sql_check_type);
        $stmt_check_type->bind_param("i", $customer_id);
        $stmt_check_type->execute();
        $result_type = $stmt_check_type->get_result();
        if ($result_type->num_rows === 1 && ($result_type->fetch_assoc()['payment_type'] == 'portal_0' || $result_type->fetch_assoc()['payment_type'] == 'personal_0')) {
            $new_customer_commission = $new_amount_usd * 0.03; 
            $new_customer_commission_status = 'pending';
        } else {
            $new_admin_commission = $new_amount_usd * 0.005;
        }

        // ৩. ব্যালেন্স অ্যাডজাস্টমেন্ট হিসাব করুন
        $balance_adjustment = $old_amount_usd - $new_amount_usd;

        // ৪. Transaction শুরু করুন
        $mysqli->begin_transaction();
        try {
            $sql_update_order = "UPDATE orders SET 
                                    date = ?, amount_usd = ?, mg_rate = ?, bdt_amount = ?, 
                                    commission_amount = ?, customer_commission = ?, 
                                    customer_commission_status = ?
                                  WHERE id = ?";
            $stmt_update = $mysqli->prepare($sql_update_order);
            $stmt_update->bind_param("sddddssi", 
                $new_date, $new_amount_usd, $new_mg_rate, $new_bdt_amount_rounded, 
                $new_admin_commission, $new_customer_commission, $new_customer_commission_status, 
                $order_id
            );
            $stmt_update->execute();

            $sql_update_wallet = "UPDATE customers SET wallet_balance = wallet_balance + ? WHERE id = ?";
            $stmt_wallet = $mysqli->prepare($sql_update_wallet);
            $stmt_wallet->bind_param("di", $balance_adjustment, $customer_id);
            $stmt_wallet->execute();

            // দ্রষ্টব্য: এই এডিটরটি অ্যাডমিন ফি রি-ক্যালকুলেট বা ডিলিট করে না।
            // অ্যাডমিন ফি পরিবর্তন করতে হলে মূল অর্ডার ডিলিট করে নতুন করে তৈরি করতে হবে।
            
            $mysqli->commit();
            $success_message = "অর্ডার সফলভাবে আপডেট করা হয়েছে। কাস্টমারের ওয়ালেট ব্যালেন্স অ্যাডজাস্ট করা হয়েছে।";
        } catch (mysqli_sql_exception $exception) {
            $mysqli->rollback();
            $error_message = "আপডেট করার সময় ত্রুটি ঘটেছে: " . $exception->getMessage();
        }
    } else { $error_message = "মূল এন্ট্রিটি খুঁজে পাওয়া যায়নি।"; }
}

// --- PHP: পেজ লোড লজিক ---
if ($order_id > 0) {
    $sql_get_entry = "SELECT o.*, c.full_name 
                      FROM orders o
                      JOIN customers c ON o.customer_id = c.id
                      WHERE o.id = ?";
    $stmt_get = $mysqli->prepare($sql_get_entry);
    $stmt_get->bind_param("i", $order_id);
    $stmt_get->execute();
    $result_entry = $stmt_get->get_result();
    if ($result_entry->num_rows === 1) {
        $entry = $result_entry->fetch_assoc();
    } else { $error_message = "এন্ট্রি খুঁজে পাওয়া যায়নি।"; $entry = null; }
} else { $error_message = "কোনো এন্ট্রি আইডি সিলেক্ট করা হয়নি।"; $entry = null; }
?>

<div class="card">
    <div class="card-header">
        <h2>অর্ডার এন্ট্রি এডিট করুন (ID: <?php echo htmlspecialchars($entry['custom_id'] ?? 'N/A'); ?>)</h2>
    </div>
    <div class="card-body">
        <?php if ($success_message): ?><div class="alert alert-success"><?php echo $success_message; ?> ( <a href="orders.php">লগে ফিরে যান</a> )</div><?php endif; ?>
        <?php if ($error_message): ?><div class="alert alert-danger"><?php echo $error_message; ?></div><?php endif; ?>
        <?php if ($entry): ?>
        <form action="edit_order.php?id=<?php echo $order_id; ?>" method="POST">
            <input type="hidden" name="order_id" value="<?php echo $entry['id']; ?>">
            <div class="form-group">
                <label>কাস্টমার:</label>
                <input type="text" value="<?php echo htmlspecialchars($entry['full_name']); ?>" readonly style="background-color: #eee;">
            </div>
            <div class="form-group">
                <label for="date">তারিখ:</label>
                <input type="date" id="date" name="date" value="<?php echo htmlspecialchars($entry['date']); ?>" required>
            </div>
            <div class="form-group">
                <label for="amount_usd">অর্ডারের পরিমাণ (USD):</label>
                <input type="number" id="amount_usd" name="amount_usd" value="<?php echo htmlspecialchars($entry['amount_usd']); ?>" step="0.01" required>
            </div>
            <div class="form-group">
                <label for="bdt_amount">BDT পরিমাণ:</label>
                <input type="number" id="bdt_amount" name="bdt_amount" value="<?php echo htmlspecialchars($entry['bdt_amount']); ?>" step="0.01" required>
            </div>
            <button type="submit" name="update_order" class="btn btn-success">অর্ডার আপডেট করুন</button>
            <a href="orders.php" class="btn" style="background-color: #6c757d; color: white;">বাতিল</a>
        </form>
        <?php endif; ?>
    </div>
</div>

<?php
include 'admin_footer.php';
?>