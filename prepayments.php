<?php
include 'admin_header.php'; // হেডার ফাইল

$success_message = '';
$error_message = '';

// --- PHP: ডিলিট লজিক ---
if (isset($_GET['delete_id']) && !empty($_GET['delete_id'])) {
    $prepayment_id_to_delete = (int)$_GET['delete_id'];
    $sql_get_entry = "SELECT customer_id, amount_credited FROM prepayments WHERE id = ?";
    $stmt_get = $mysqli->prepare($sql_get_entry);
    $stmt_get->bind_param("i", $prepayment_id_to_delete);
    $stmt_get->execute(); $result_get = $stmt_get->get_result();
    if ($result_get->num_rows === 1) {
        $entry_data = $result_get->fetch_assoc();
        $customer_id = $entry_data['customer_id'];
        $amount_to_subtract = (float)$entry_data['amount_credited'];
        $mysqli->begin_transaction();
        try {
            $sql_update_wallet = "UPDATE customers SET wallet_balance = wallet_balance - ? WHERE id = ?";
            $stmt_wallet = $mysqli->prepare($sql_update_wallet);
            $stmt_wallet->bind_param("di", $amount_to_subtract, $customer_id);
            $stmt_wallet->execute();
            $sql_delete = "DELETE FROM prepayments WHERE id = ?";
            $stmt_delete = $mysqli->prepare($sql_delete);
            $stmt_delete->bind_param("i", $prepayment_id_to_delete);
            $stmt_delete->execute();
            $mysqli->commit();
            $success_message = "এন্ট্রি সফলভাবে ডিলিট করা হয়েছে।";
        } catch (mysqli_sql_exception $exception) { $mysqli->rollback(); $error_message = "ডিলিট করার সময় ত্রুটি ঘটেছে: " . $exception->getMessage(); }
    } else { $error_message = "ডিলিট করার জন্য এন্ট্রিটি খুঁজে পাওয়া যায়নি।"; }
}

// --- PHP: প্রি-পেমেন্ট ফর্ম সাবমিট করার লজিক (সঠিক) ---
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['add_prepayment'])) {
    $customer_id = $_POST['customer_id']; $amount_paid = (float)$_POST['amount_paid'];
    $payment_type = $_POST['payment_type']; $date = $_POST['date'];
    $investment_amount = 0.00; $investment_status = NULL; $flat_fee_amount = 0.00;
    $amount_credited = $amount_paid;
    if ($payment_type == 'portal_2.5') {
        $investment_amount = $amount_paid * 0.025;
        $amount_credited = $amount_paid + $investment_amount;
        $investment_status = 'pending';
    } elseif ($payment_type == 'personal_2.5') {
        $investment_amount = $amount_paid * 0.025;
        $flat_fee_amount = 1.00;
        $amount_credited = $amount_paid - $flat_fee_amount + $investment_amount;
        $investment_status = 'pending';
    } elseif ($payment_type == 'portal_0') {
        $amount_credited = $amount_paid;
    } elseif ($payment_type == 'personal_0') {
        $flat_fee_amount = 1.00;
        $amount_credited = $amount_paid - $flat_fee_amount;
    }
    
    $mysqli->begin_transaction();
    try {
        $custom_ppid = getNextCustomID('PPID', $mysqli); 
        
        $sql_prepayment = "INSERT INTO prepayments 
                            (custom_id, customer_id, date, payment_type, amount_paid, investment_amount, investment_status, flat_fee_amount, amount_credited) 
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
        $stmt_prepayment = $mysqli->prepare($sql_prepayment);
        
        // --- START: এই লাইনটি ঠিক করা হয়েছে ---
        $stmt_prepayment->bind_param("sissddsdd", 
        // --- END: এই লাইনটি ঠিক করা হয়েছে ---
            $custom_ppid, $customer_id, $date, $payment_type, $amount_paid, 
            $investment_amount, $investment_status, $flat_fee_amount, $amount_credited
        );
        $stmt_prepayment->execute();
        
        $sql_update_wallet = "UPDATE customers SET wallet_balance = wallet_balance + ? WHERE id = ?";
        $stmt_wallet = $mysqli->prepare($sql_update_wallet);
        $stmt_wallet->bind_param("di", $amount_credited, $customer_id);
        $stmt_wallet->execute();
        
        $mysqli->commit();
        $success_message = "প্রি-পেমেন্ট সফলভাবে এন্ট্রি হয়েছে। নতুন আইডি: " . $custom_ppid;
    } catch (mysqli_sql_exception $exception) { 
        $mysqli->rollback(); 
        $error_message = "একটি ত্রুটি ঘটেছে: " . $exception->getMessage(); 
    }
}
$customers_result = $mysqli->query("SELECT id, full_name FROM customers ORDER BY full_name ASC");
$customers_list_for_filter = $mysqli->query("SELECT id, full_name FROM customers ORDER BY full_name ASC");

// --- PHP: ফিল্টার লজিক ---
$filter_customer_id = $_GET['customer_id'] ?? '';
$filter_start_date = $_GET['start_date'] ?? '';
$filter_end_date = $_GET['end_date'] ?? '';
$sql_log = "SELECT p.*, c.full_name 
            FROM prepayments p
            JOIN customers c ON p.customer_id = c.id
            WHERE p.payment_type NOT IN ('commission_bonus', 'admin_fee')";
$params = [];
$types = "";
if (!empty($filter_customer_id)) {
    $sql_log .= " AND p.customer_id = ?";
    $params[] = $filter_customer_id;
    $types .= "i";
}
if (!empty($filter_start_date) && !empty($filter_end_date)) {
    $sql_log .= " AND p.date BETWEEN ? AND ?";
    $params[] = $filter_start_date;
    $params[] = $filter_end_date;
    $types .= "ss";
}
$sql_log .= " ORDER BY p.id DESC LIMIT 200"; 
$stmt_log = $mysqli->prepare($sql_log);
if (!empty($types)) {
    $bind_params = [];
    $bind_params[] = &$types;
    foreach ($params as $key => $value) { $bind_params[] = &$params[$key]; }
    call_user_func_array([$stmt_log, 'bind_param'], $bind_params);
}
$stmt_log->execute();
$prepayments_log = $stmt_log->get_result();
?>

<div class="card">
    <div class="card-header"><h2>নতুন প্রি-পেমেন্ট এন্ট্রি করুন</h2></div>
    <div class="card-body">
        <?php if ($success_message): ?><div class="alert alert-success"><?php echo $success_message; ?></div><?php endif; ?>
        <?php if ($error_message): ?><div class="alert alert-danger"><?php echo $error_message; ?></div><?php endif; ?>
        <form action="prepayments.php" method="POST">
            <div class="form-group"><label for="customer_id">কাস্টমার সিলেক্ট করুন:</label>
                <select id="customer_id" name="customer_id" required>
                    <option value="">-- কাস্টমার বাছুন --</option>
                    <?php if ($customers_result->num_rows > 0) { while ($customer = $customers_result->fetch_assoc()) { echo '<option value="' . $customer['id'] . '">' . htmlspecialchars($customer['full_name']) . '</option>'; } } ?>
                </select>
            </div>
            <div class="form-group"><label for="date">তারিখ:</label><input type="date" id="date" name="date" value="<?php echo date('Y-m-d'); ?>" required></div>
            <div class="form-group"><label for="amount_paid">কাস্টমার কত দিয়েছে (USD):</label><input type="number" id="amount_paid" name="amount_paid" step="0.01" placeholder="e.g., 1000" required></div>
            <div class="form-group"><label>পেমেন্ট টাইপ:</label>
                <div class="radio-group" style="line-height: 2;">
                    <label style="display: block;"><input type="radio" name="payment_type" value="portal_2.5" required> Portal (শুধু 2.5% ইনভেস্টমেন্ট যোগ হবে)</label>
                    <label style="display: block;"><input type="radio" name="payment_type" value="personal_2.5" required> Personal (2.5% যোগ হবে এবং $1.00 ফি কাটবে)</label>
                    <label style="display: block;"><input type="radio" name="payment_type" value="portal_0" required> Portal (শুধু 0% ইনভেস্টমেন্ট যোগ হবে)</label>
                    <label style="display: block;"><input type="radio" name="payment_type" value="personal_0" required> Personal (0% যোগ হবে এবং $1.00 ফি কাটবে)</label>
                </div>
            </div>
            <button type="submit" name="add_prepayment" class="btn btn-success">প্রি-পেমেন্ট এন্ট্রি করুন</button>
        </form>
    </div>
</div>

<div class="card">
    <div class="card-header"><h2>প্রি-পেমেন্ট লগ ফিল্টার করুন</h2></div>
    <div class="card-body">
        <form action="prepayments.php" method="GET" class="filter-form" style="display: flex; gap: 1rem; align-items: flex-end;">
            <div class="form-group" style="flex: 1;"><label for="customer_id_filter">কাস্টমার:</label>
                <select id="customer_id_filter" name="customer_id" class="form-control">
                    <option value="">-- সকল কাস্টমার --</option>
                    <?php if ($customers_list_for_filter->num_rows > 0) { while ($customer = $customers_list_for_filter->fetch_assoc()) { $selected = ($filter_customer_id == $customer['id']) ? 'selected' : ''; echo '<option value="' . $customer['id'] . '" ' . $selected . '>' . htmlspecialchars($customer['full_name']) . '</option>'; } } ?>
                </select>
            </div>
            <div class="form-group" style="flex: 1;"><label for="start_date_filter">শুরুর তারিখ:</label><input type="date" id="start_date_filter" name="start_date" value="<?php echo htmlspecialchars($filter_start_date); ?>" class="form-control"></div>
            <div class="form-group" style="flex: 1;"><label for="end_date_filter">শেষ তারিখ:</label><input type="date" id="end_date_filter" name="end_date" value="<?php echo htmlspecialchars($filter_end_date); ?>" class="form-control"></div>
            <button type="submit" class="btn btn-primary">ফিল্টার</button>
            <a href="prepayments.php" class="btn" style="background-color: #6c757d; color: white;">রিসেট</a>
        </form>
    </div>
</div>

<div class="card">
    <div class="card-header"><h2>প্রি-পেমেন্ট লগ</h2></div>
    <div class="card-body">
        <table style="font-size: 0.9rem;">
            <thead>
                <tr>
                    <th>ID</th> <th>তারিখ</th> <th>কাস্টমার</th> <th>টাইপ</th>
                    <th>কাস্টমার দিয়েছে</th> <th>ইনভেস্টমেন্ট</th> <th>ফ্ল্যাট ফি ($1)</th>
                    <th>ওয়ালেটে যোগ</th> <th>অ্যাকশন</th>
                </tr>
            </thead>
            <tbody>
                <?php
                if ($prepayments_log->num_rows > 0) {
                    while ($log = $prepayments_log->fetch_assoc()) {
                        $type_display = '';
                        switch ($log['payment_type']) {
                            case 'portal_2.5': $type_display = 'Portal (2.5%)'; break;
                            case 'personal_2.5': $type_display = 'Personal (2.5%)'; break;
                            case 'portal_0': $type_display = 'Portal (0%)'; break;
                            case 'personal_0': $type_display = 'Personal (0%)'; break;
                            default: $type_display = ucfirst($log['payment_type']);
                        }
                        echo "<tr>";
                        echo "<td><strong>" . htmlspecialchars($log['custom_id']) . "</strong></td>";
                        echo "<td>" . date("d M, Y", strtotime($log['date'])) . "</td>";
                        echo "<td>" . htmlspecialchars($log['full_name']) . "</td>";
                        echo "<td>" . $type_display . "</td>";
                        echo "<td>$" . number_format($log['amount_paid'], 2) . "</td>";
                        echo "<td>$" . number_format($log['investment_amount'], 2) . "</td>";
                        echo "<td>$" . number_format($log['flat_fee_amount'], 2) . "</td>";
                        echo "<td><strong>$" . number_format($log['amount_credited'], 2) . "</strong></td>";
                        echo '<td style="white-space: nowrap;">
                                <a href="edit_prepayment.php?id=' . $log['id'] . '" class="btn btn-primary" style="padding: 0.4rem 0.6rem; font-size: 0.8rem;">এডিট</a>
                                <a href="prepayments.php?delete_id=' . $log['id'] . '" class="btn" style="background-color: #e74c3c; color: white; padding: 0.4rem 0.6rem; font-size: 0.8rem;" 
                                   onclick="return confirm(\'আপনি কি নিশ্চিত যে এই এন্ট্রিটি ডিলিট করতে চান?\')">ডিলিট</a>
                              </td>';
                        echo "</tr>";
                    }
                } else {
                    echo "<tr><td colspan='9'>এই ফিল্টারে কোনো প্রি-পেমেন্ট এন্ট্রি খুঁজে পাওয়া যায়নি।</td></tr>";
                }
                ?>
            </tbody>
        </table>
    </div>
</div>

<?php
include 'admin_footer.php';
?>