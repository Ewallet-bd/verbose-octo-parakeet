<?php
include 'admin_header.php'; // হেডার ফাইল

$success_message = '';
$error_message = '';

// --- PHP: ডিলিট লজিক ---
if (isset($_GET['delete_id']) && !empty($_GET['delete_id'])) {
    $order_id_to_delete = (int)$_GET['delete_id'];
    $sql_get_order = "SELECT customer_id, amount_usd, custom_id FROM orders WHERE id = ?";
    $stmt_get_order = $mysqli->prepare($sql_get_order);
    $stmt_get_order->bind_param("i", $order_id_to_delete);
    $stmt_get_order->execute();
    $result_order = $stmt_get_order->get_result();
    if ($result_order->num_rows === 1) {
        $order_data = $result_order->fetch_assoc();
        $customer_id = $order_data['customer_id'];
        $amount_to_restore_order = (float)$order_data['amount_usd'];
        $custom_oid = $order_data['custom_id']; 
        $sql_get_fees = "SELECT id, amount_credited FROM prepayments WHERE description LIKE ?";
        $description_like = "%({$custom_oid})%"; 
        $stmt_get_fees = $mysqli->prepare($sql_get_fees);
        $stmt_get_fees->bind_param("s", $description_like);
        $stmt_get_fees->execute();
        $result_fees = $stmt_get_fees->get_result();
        $net_fee_reversal = 0.00;
        $prepayment_ids_to_delete = [];
        while ($fee_row = $result_fees->fetch_assoc()) {
            $net_fee_reversal += (float)$fee_row['amount_credited'];
            $prepayment_ids_to_delete[] = $fee_row['id'];
        }
        $total_wallet_adjustment = $amount_to_restore_order - $net_fee_reversal;
        $mysqli->begin_transaction();
        try {
            $sql_update_wallet = "UPDATE customers SET wallet_balance = wallet_balance + ? WHERE id = ?";
            $stmt_wallet = $mysqli->prepare($sql_update_wallet);
            $stmt_wallet->bind_param("di", $total_wallet_adjustment, $customer_id);
            $stmt_wallet->execute();
            $sql_delete_order = "DELETE FROM orders WHERE id = ?";
            $stmt_delete_order = $mysqli->prepare($sql_delete_order);
            $stmt_delete_order->bind_param("i", $order_id_to_delete);
            $stmt_delete_order->execute();
            if (count($prepayment_ids_to_delete) > 0) {
                $ids_placeholder = implode(',', array_fill(0, count($prepayment_ids_to_delete), '?'));
                $sql_delete_fees = "DELETE FROM prepayments WHERE id IN ($ids_placeholder)";
                $stmt_delete_fees = $mysqli->prepare($sql_delete_fees);
                $types_del = str_repeat('i', count($prepayment_ids_to_delete));
                $stmt_delete_fees->bind_param($types_del, ...$prepayment_ids_to_delete);
                $stmt_delete_fees->execute();
            }
            $mysqli->commit();
            $success_message = "অর্ডার #" . $order_id_to_delete . " এবং সম্পর্কিত সমস্ত কমিশন/ফি সফলভাবে ডিলিট করা হয়েছে।";
        } catch (mysqli_sql_exception $exception) { $mysqli->rollback(); $error_message = "ডিলিট করার সময় ত্রুটি ঘটেছে: " . $exception->getMessage(); }
    } else { $error_message = "ডিলিট করার জন্য এন্ট্রিটি খুঁজে পাওয়া যায়নি।"; }
}
if (isset($_GET['success']) && $_GET['success'] == 1) $success_message = "কমিশন সফলভাবে কমপ্লিট করা হয়েছে!";
if (isset($_GET['error'])) $error_message = "একটি ত্রুটি ঘটেছে: " . htmlspecialchars($_GET['msg']);

// --- PHP: অর্ডার ফর্ম সাবমিট করার লজিক (সঠিক) ---
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['add_order'])) {
    $customer_id = $_POST['customer_id'];
    $amount_usd = (float)$_POST['amount_usd'];
    $bdt_amount = (float)$_POST['bdt_amount'];
    $date = $_POST['date'];
    $enable_admin_commission = isset($_POST['enable_admin_commission']);
    $admin_commission_per_lakh = (float)($_POST['admin_commission_per_lakh'] ?? 0);
    $admin_fee_usd_rate = (float)($_POST['admin_fee_usd_rate'] ?? 0); // নতুন রেট
    
    $mg_rate = 0; if ($amount_usd > 0) $mg_rate = $bdt_amount / $amount_usd;
    $customer_commission = 0.00; $customer_commission_status = 'completed';
    $admin_commission_usd = 0.00; $admin_fee_usd_to_deduct = 0.00;
    $admin_commission_status = 'pending'; 

    $sql_check_type = "SELECT payment_type FROM prepayments WHERE customer_id = ? AND payment_type IN ('portal_0', 'personal_0', 'portal_2.5', 'personal_2.5') ORDER BY date DESC, id DESC LIMIT 1";
    $stmt_check_type = $mysqli->prepare($sql_check_type);
    $stmt_check_type->bind_param("i", $customer_id);
    $stmt_check_type->execute();
    $result_type = $stmt_check_type->get_result();
    $is_0_percent_customer = false;
    if ($result_type->num_rows === 1) {
        $last_type = $result_type->fetch_assoc()['payment_type'];
        if ($last_type == 'portal_0' || $last_type == 'personal_0') $is_0_percent_customer = true;
    }
    $stmt_check_type->close();
    $bdt_amount_rounded = round($bdt_amount, 2); 

    if ($is_0_percent_customer) {
        $customer_commission = $amount_usd * 0.03; 
        $customer_commission_status = 'pending';
        
        if ($enable_admin_commission && $admin_commission_per_lakh > 0 && $admin_fee_usd_rate > 0) {
            $total_lakhs = $bdt_amount_rounded / 100000;
            if ($total_lakhs > 0) {
                $admin_fee_bdt = $total_lakhs * $admin_commission_per_lakh;
                $admin_fee_usd_to_deduct = $admin_fee_bdt / $admin_fee_usd_rate; 
            }
        }
        $admin_commission_usd = $admin_fee_usd_to_deduct; 
        $admin_commission_status = 'received';
        
    } else {
        $admin_commission_usd = $amount_usd * 0.005;
        $admin_commission_status = 'pending'; 
    }
    
    $total_deduction = $amount_usd + $admin_fee_usd_to_deduct;
    $mysqli->begin_transaction();
    try {
        $custom_oid = getNextCustomID('OID', $mysqli);
        
        $sql_order = "INSERT INTO orders 
                        (custom_id, customer_id, date, amount_usd, mg_rate, bdt_amount, 
                         commission_amount, commission_status, 
                         customer_commission, customer_commission_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        $stmt_order = $mysqli->prepare($sql_order);
        
        // --- START: এই লাইনটি ঠিক করা হয়েছে (sisddddsd s) ---
        $stmt_order->bind_param("sisddddsds", 
        // --- END: এই লাইনটি ঠিক করা হয়েছে ---
            $custom_oid, $customer_id, $date, $amount_usd, $mg_rate, $bdt_amount_rounded, 
            $admin_commission_usd, $admin_commission_status, 
            $customer_commission, $customer_commission_status
        );
        $stmt_order->execute();
        
        $sql_update_wallet = "UPDATE customers SET wallet_balance = wallet_balance - ? WHERE id = ?";
        $stmt_wallet = $mysqli->prepare($sql_update_wallet);
        $stmt_wallet->bind_param("di", $total_deduction, $customer_id);
        $stmt_wallet->execute();
        
        if ($admin_fee_usd_to_deduct > 0) {
            $admin_fee_negative = -1 * $admin_fee_usd_to_deduct;
            $description = "এডমিন কমিশন ({$custom_oid})"; 
            $sql_log_fee = "INSERT INTO prepayments (customer_id, date, payment_type, amount_paid, amount_credited, description) VALUES (?, ?, 'admin_fee', 0, ?, ?)";
            $stmt_log_fee = $mysqli->prepare($sql_log_fee);
            $stmt_log_fee->bind_param("isds", $customer_id, $date, $admin_fee_negative, $description);
            $stmt_log_fee->execute();
        }
        $mysqli->commit();
        $success_message = "অর্ডার সফলভাবে এন্ট্রি হয়েছে। নতুন আইডি: " . $custom_oid;
    } catch (mysqli_sql_exception $exception) {
        $mysqli->rollback();
        $error_message = "একটি ত্রুটি ঘটেছে: " . $exception->getMessage();
    }
}

// --- PHP: ড্রপডাউন এবং ফিল্টার লজিক ---
$customers_result = $mysqli->query("SELECT id, full_name, wallet_balance FROM customers ORDER BY full_name ASC");
$customers_list_for_filter = $mysqli->query("SELECT id, full_name FROM customers ORDER BY full_name ASC");
$filter_customer_id = $_GET['customer_id'] ?? '';
$filter_start_date = $_GET['start_date'] ?? '';
$filter_end_date = $_GET['end_date'] ?? '';
$sql_log = "SELECT o.*, c.full_name FROM orders o JOIN customers c ON o.customer_id = c.id WHERE 1=1"; 
$params = [];
$types = "";
if (!empty($filter_customer_id)) {
    $sql_log .= " AND o.customer_id = ?";
    $params[] = $filter_customer_id;
    $types .= "i";
}
if (!empty($filter_start_date) && !empty($filter_end_date)) {
    $sql_log .= " AND o.date BETWEEN ? AND ?";
    $params[] = $filter_start_date;
    $params[] = $filter_end_date;
    $types .= "ss";
}
$sql_log .= " ORDER BY o.id DESC LIMIT 200";
$stmt_log = $mysqli->prepare($sql_log);
if (!empty($types)) {
    $bind_params = [];
    $bind_params[] = &$types;
    foreach ($params as $key => $value) { $bind_params[] = &$params[$key]; }
    call_user_func_array([$stmt_log, 'bind_param'], $bind_params);
}
$stmt_log->execute();
$orders_log = $stmt_log->get_result();
?>

<div class="card">
    <div class="card-header"><h2>নতুন অর্ডার এন্ট্রি করুন</h2></div>
    <div class="card-body">
        <?php if ($success_message): ?><div class="alert alert-success"><?php echo $success_message; ?></div><?php endif; ?>
        <?php if ($error_message): ?><div class="alert alert-danger"><?php echo $error_message; ?></div><?php endif; ?>
        <form action="orders.php" method="POST">
            <div class="form-group"><label for="customer_id">কাস্টমার সিলেক্ট করুন:</label>
                <select id="customer_id" name="customer_id" required>
                    <option value="">-- কাস্টমার বাছুন --</option>
                    <?php if ($customers_result->num_rows > 0) { while ($customer = $customers_result->fetch_assoc()) { echo '<option value="' . $customer['id'] . '">' . htmlspecialchars($customer['full_name']) . ' (Balance: $' . number_format($customer['wallet_balance'], 2) . ')' . '</option>'; } } ?>
                </select>
            </div>
            <div class="form-group"><label for="date">তারিখ:</label><input type="date" id="date" name="date" value="<?php echo date('Y-m-d'); ?>" required></div>
            <div class="form-group"><label for="amount_usd">অর্ডারের পরিমাণ (USD):</label><input type="number" id="amount_usd" name="amount_usd" step="0.01" placeholder="e.g., 7025.02" required></div>
            <div class="form-group"><label for="bdt_amount">BDT পরিমাণ:</label><input type="number" id="bdt_amount" name="bdt_amount" step="0.01" placeholder="e.g., 900000" required></div>
            <div id="optional-commission-section" style="display:none; background-color: #fdfaea; border: 1px solid #f39c12; padding: 1rem; border-radius: 5px; margin-bottom: 1rem;">
                <h4>ঐচ্ছিক অ্যাডমিন কমিশন (শুধুমাত্র 0% কাস্টমারের জন্য)</h4>
                <div class="form-group" style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" id="enable_admin_commission" name="enable_admin_commission" style="width: auto; height: 1.2rem;">
                    <label for="enable_admin_commission" style="margin-bottom: 0; font-weight: normal;">অ্যাডমিন কমিশন কাটুন (প্রতি লাখে)</label>
                </div>
                <div class="form-group">
                    <label for="admin_commission_per_lakh">প্রতি লাখে কত BDT:</label>
                    <input type="number" id="admin_commission_per_lakh" name="admin_commission_per_lakh" step="0.01" placeholder="e.g., 225">
                </div>
                <div class="form-group">
                    <label for="admin_fee_usd_rate">USD রেট (ফি-এর জন্য):</label>
                    <input type="number" id="admin_fee_usd_rate" name="admin_fee_usd_rate" step="0.01" placeholder="e.g., 125.70">
                </div>
                <small>BDT অমাউন্টের উপর ভিত্তি করে USD কেটে নেওয়া হবে।</small>
            </div>
            <button type="submit" name="add_order" class="btn btn-success">অর্ডার এন্ট্রি করুন</button>
        </form>
    </div>
</div>

<div class="card">
    <div class="card-header"><h2>অর্ডার লগ ফিল্টার করুন</h2></div>
    <div class="card-body">
        <form action="orders.php" method="GET" class="filter-form" style="display: flex; gap: 1rem; align-items: flex-end;">
            <div class="form-group" style="flex: 1;"><label for="customer_id_filter">কাস্টমার:</label>
                <select id="customer_id_filter" name="customer_id" class="form-control">
                    <option value="">-- সকল কাস্টমার --</option>
                    <?php if ($customers_list_for_filter->num_rows > 0) { while ($customer = $customers_list_for_filter->fetch_assoc()) { $selected = ($filter_customer_id == $customer['id']) ? 'selected' : ''; echo '<option value="' . $customer['id'] . '" ' . $selected . '>' . htmlspecialchars($customer['full_name']) . '</option>'; } } ?>
                </select>
            </div>
            <div class="form-group" style="flex: 1;"><label for="start_date_filter">শুরুর তারিখ:</label><input type="date" id="start_date_filter" name="start_date" value="<?php echo htmlspecialchars($filter_start_date); ?>" class="form-control"></div>
            <div class="form-group" style="flex: 1;"><label for="end_date_filter">শেষ তারিখ:</label><input type="date" id="end_date_filter" name="end_date" value="<?php echo htmlspecialchars($filter_end_date); ?>" class="form-control"></div>
            <button type="submit" class="btn btn-primary">ফিল্টার</button>
            <a href="orders.php" class="btn" style="background-color: #6c757d; color: white;">রিসেট</a>
        </form>
    </div>
</div>

<div class="card">
    <div class="card-header"><h2>অর্ডার লগ</h2></div>
    <div class="card-body">
        <table style="font-size: 0.9rem;">
            <thead>
                <tr>
                    <th>ID</th> <th>তারিখ</th> <th>কাস্টমার</th> <th>অর্ডার (USD)</th>
                    <th>BDT পরিমাণ</th> <th>MG রেট</th> <th>কাস্টমার কমিশন (৩%)</th>
                    <th>অ্যাডমিন কমিশন</th> <th>অ্যাকশন</th>
                </tr>
            </thead>
            <tbody>
                <?php
                if ($orders_log->num_rows > 0) {
                    while ($log = $orders_log->fetch_assoc()) {
                        echo "<tr>";
                        echo "<td><strong>" . htmlspecialchars($log['custom_id']) . "</strong></td>";
                        echo "<td>" . date("d M, Y", strtotime($log['date'])) . "</td>";
                        echo "<td>" . htmlspecialchars($log['full_name']) . "</td>";
                        echo "<td><strong>$" . number_format($log['amount_usd'], 2) . "</strong></td>";
                        echo "<td>" . number_format($log['bdt_amount'], 2) . " BDT</td>";
                        echo "<td>" . number_format($log['mg_rate'], 4) . "</td>";
                        echo "<td>";
                        if ($log['customer_commission'] > 0) {
                            echo "$" . number_format($log['customer_commission'], 2);
                            echo " (<span style='color:" . ($log['customer_commission_status'] == 'pending' ? 'red' : 'green') . ";'>" . $log['customer_commission_status'] . "</span>)";
                        } else { echo "N/A"; }
                        echo "</td>";
                        echo "<td>$" . number_format($log['commission_amount'], 2) . " (<span style='color:" . ($log['commission_status'] == 'pending' ? 'red' : 'green') . ";'>" . $log['commission_status'] . "</span>)</td>";
                        
                        echo '<td style="white-space: nowrap;">';
                        if ($log['customer_commission'] > 0 && $log['customer_commission_status'] == 'pending') {
                            echo '<a href="complete_commission.php?order_id=' . $log['id'] . '" class="btn btn-success" style="padding: 0.4rem; font-size: 0.8rem; margin-bottom: 5px;" 
                                   onclick="return confirm(\'আপনি কি নিশ্চিত? এটি কাস্টমারকে $' . number_format($log['customer_commission'], 2) . ' কমিশন দেবে।\')">Complete Commission</a><br>';
                        }
                        echo '<a href="edit_order.php?id=' . $log['id'] . '" class="btn btn-primary" style="padding: 0.4rem 0.6rem; font-size: 0.8rem; margin-left: 5px;">এডিট</a>
                              <a href="orders.php?delete_id=' . $log['id'] . '" class="btn" style="background-color: #e74c3c; color: white; padding: 0.4rem 0.6rem; font-size: 0.8rem; margin-left: 5px;" 
                                 onclick="return confirm(\'আপনি কি নিশ্চিত যে এই অর্ডারটি ডিলিট করতে চান?\')">ডিলিট</a>
                              </td>';
                        echo "</tr>";
                    }
                } else {
                    echo "<tr><td colspan='9'>এই ফিল্টারে কোনো অর্ডার এন্ট্রি খুঁজে পাওয়া যায়নি।</td></tr>";
                }
                ?>
            </tbody>
        </table>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    const customerSelect = document.getElementById('customer_id');
    const commissionSection = document.getElementById('optional-commission-section');
    const commissionCheckbox = document.getElementById('enable_admin_commission');
    const commissionInput = document.getElementById('admin_commission_per_lakh');
    const commissionRateInput = document.getElementById('admin_fee_usd_rate');

    customerSelect.addEventListener('change', function() {
        const customerId = this.value;
        if (!customerId) {
            commissionSection.style.display = 'none';
            commissionCheckbox.checked = false;
            commissionInput.value = '';
            commissionRateInput.value = '';
            return;
        }
        fetch('check_customer_type.php?customer_id=' + customerId)
            .then(response => response.json())
            .then(data => {
                if (data.is_0_percent) {
                    commissionSection.style.display = 'block';
                } else {
                    commissionSection.style.display = 'none';
                    commissionCheckbox.checked = false;
                    commissionInput.value = '';
                    commissionRateInput.value = '';
                }
            })
            .catch(error => {
                console.error('Error fetching customer type:', error);
                commissionSection.style.display = 'none';
            });
    });
});
</script>

<?php
include 'admin_footer.php';
?>