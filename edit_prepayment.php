<?php
include 'admin_header.php';

$success_message = '';
$error_message = '';
$prepayment_id = $_GET['id'] ?? 0; // এটি ডাটাবেসের আসল ID (1, 2, 3...)

// --- PHP: আপডেট ফর্ম সাবমিট করার লজিক ---
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['update_prepayment'])) {
    
    $prepayment_id = (int)$_POST['prepayment_id'];
    $new_amount_paid = (float)$_POST['amount_paid'];
    $new_payment_type = $_POST['payment_type'];
    $new_date = $_POST['date'];

    $sql_get_old = "SELECT customer_id, amount_credited FROM prepayments WHERE id = ?";
    $stmt_get_old = $mysqli->prepare($sql_get_old);
    $stmt_get_old->bind_param("i", $prepayment_id);
    $stmt_get_old->execute();
    $result_old = $stmt_get_old->get_result();
    
    if ($result_old->num_rows === 1) {
        $old_data = $result_old->fetch_assoc();
        $customer_id = $old_data['customer_id'];
        $old_amount_credited = (float)$old_data['amount_credited'];

        $new_investment_amount = 0.00; $new_investment_status = NULL;
        $new_flat_fee_amount = 0.00; $new_amount_credited = $new_amount_paid;

        if ($new_payment_type == 'portal_2.5') {
            $new_investment_amount = $new_amount_paid * 0.025;
            $new_amount_credited = $new_amount_paid + $new_investment_amount;
            $new_investment_status = 'pending';
        } elseif ($new_payment_type == 'personal_2.5') {
            $new_investment_amount = $new_amount_paid * 0.025;
            $new_flat_fee_amount = 1.00;
            $new_amount_credited = $new_amount_paid - $new_flat_fee_amount + $new_investment_amount;
            $new_investment_status = 'pending';
        } elseif ($new_payment_type == 'portal_0') {
            $new_amount_credited = $new_amount_paid;
        } elseif ($new_payment_type == 'personal_0') {
            $new_flat_fee_amount = 1.00;
            $new_amount_credited = $new_amount_paid - $new_flat_fee_amount;
        }
        
        $balance_adjustment = $new_amount_credited - $old_amount_credited;

        $mysqli->begin_transaction();
        try {
            // `custom_id` আপডেট করা হয় না, শুধু বাকি তথ্য আপডেট হয়
            $sql_update_prepayment = "UPDATE prepayments SET 
                                        date = ?, payment_type = ?, amount_paid = ?, 
                                        investment_amount = ?, investment_status = ?, 
                                        flat_fee_amount = ?, amount_credited = ? 
                                      WHERE id = ?";
            $stmt_update = $mysqli->prepare($sql_update_prepayment);
            $stmt_update->bind_param("ssddssdi", 
                $new_date, $new_payment_type, $new_amount_paid, 
                $new_investment_amount, $new_investment_status, $new_flat_fee_amount, 
                $new_amount_credited, $prepayment_id
            );
            $stmt_update->execute();

            $sql_update_wallet = "UPDATE customers SET wallet_balance = wallet_balance + ? WHERE id = ?";
            $stmt_wallet = $mysqli->prepare($sql_update_wallet);
            $stmt_wallet->bind_param("di", $balance_adjustment, $customer_id);
            $stmt_wallet->execute();

            $mysqli->commit();
            $success_message = "এন্ট্রি সফলভাবে আপডেট করা হয়েছে।";
        } catch (mysqli_sql_exception $exception) {
            $mysqli->rollback();
            $error_message = "আপডেট করার সময় ত্রুটি ঘটেছে: " . $exception->getMessage();
        }
    } else { $error_message = "মূল এন্ট্রিটি খুঁজে পাওয়া যায়নি।"; }
}

// --- PHP: পেজ লোড লজিক ---
if ($prepayment_id > 0) {
    $sql_get_entry = "SELECT p.*, c.full_name 
                      FROM prepayments p
                      JOIN customers c ON p.customer_id = c.id
                      WHERE p.id = ?";
    $stmt_get = $mysqli->prepare($sql_get_entry);
    $stmt_get->bind_param("i", $prepayment_id);
    $stmt_get->execute();
    $result_entry = $stmt_get->get_result();
    if ($result_entry->num_rows === 1) {
        $entry = $result_entry->fetch_assoc();
    } else { $error_message = "এন্ট্রি খুঁজে পাওয়া যায়নি।"; $entry = null; }
} else { $error_message = "কোনো এন্ট্রি আইডি সিলেক্ট করা হয়নি।"; $entry = null; }
?>

<div class="card">
    <div class="card-header">
        <h2>প্রি-পেমেন্ট এন্ট্রি এডিট করুন (ID: <?php echo htmlspecialchars($entry['custom_id'] ?? 'N/A'); ?>)</h2>
    </div>
    <div class="card-body">
        <?php if ($success_message): ?><div class="alert alert-success"><?php echo $success_message; ?> ( <a href="prepayments.php">লগে ফিরে যান</a> )</div><?php endif; ?>
        <?php if ($error_message): ?><div class="alert alert-danger"><?php echo $error_message; ?></div><?php endif; ?>
        <?php if ($entry): ?>
        <form action="edit_prepayment.php?id=<?php echo $prepayment_id; ?>" method="POST">
            <input type="hidden" name="prepayment_id" value="<?php echo $entry['id']; ?>">
            <div class="form-group">
                <label>কাস্টমার:</label>
                <input type="text" value="<?php echo htmlspecialchars($entry['full_name']); ?>" readonly style="background-color: #eee;">
            </div>
            <div class="form-group">
                <label for="date">তারিখ:</label>
                <input type="date" id="date" name="date" value="<?php echo htmlspecialchars($entry['date']); ?>" required>
            </div>
            <div class="form-group">
                <label for="amount_paid">কাস্টমার কত দিয়েছে (USD):</label>
                <input type="number" id="amount_paid" name="amount_paid" value="<?php echo htmlspecialchars($entry['amount_paid']); ?>" step="0.01" required>
            </div>
            <div class="form-group"><label>পেমেন্ট টাইপ:</label>
                <div class="radio-group" style="line-height: 2;">
                    <label style="display: block;"><input type="radio" name="payment_type" value="portal_2.5" <?php echo ($entry['payment_type'] == 'portal_2.5') ? 'checked' : ''; ?> required> Portal (শুধু 2.5% ইনভেস্টমেন্ট যোগ হবে)</label>
                    <label style="display: block;"><input type="radio" name="payment_type" value="personal_2.5" <?php echo ($entry['payment_type'] == 'personal_2.5') ? 'checked' : ''; ?> required> Personal (2.5% যোগ হবে এবং $1.00 ফি কাটবে)</label>
                    <label style="display: block;"><input type="radio" name="payment_type" value="portal_0" <?php echo ($entry['payment_type'] == 'portal_0') ? 'checked' : ''; ?> required> Portal (শুধু 0% ইনভেস্টমেন্ট যোগ হবে)</label>
                    <label style="display: block;"><input type="radio" name="payment_type" value="personal_0" <?php echo ($entry['payment_type'] == 'personal_0') ? 'checked' : ''; ?> required> Personal (0% যোগ হবে এবং $1.00 ফি কাটবে)</label>
                </div>
            </div>
            <button type="submit" name="update_prepayment" class="btn btn-success">এন্ট্রি আপডেট করুন</button>
            <a href="prepayments.php" class="btn" style="background-color: #6c757d; color: white;">বাতিল</a>
        </form>
        <?php endif; ?>
    </div>
</div>

<?php
include 'admin_footer.php';
?>