<?php
include 'customer_header.php'; // কাস্টমার হেডার

// --- ফিল্টার এবং পেজিনেশন ভেরিয়েবল সেট করা ---
$customer_id = $_SESSION['customer_id'];
$limit = 6;
$start_date = $_GET['start_date'] ?? '';
$end_date = $_GET['end_date'] ?? '';
$page_prepayment = isset($_GET['page_prepayment']) ? (int)$_GET['page_prepayment'] : 1;
if ($page_prepayment < 1) $page_prepayment = 1;
$offset_prepayment = ($page_prepayment - 1) * $limit;
$page_order = isset($_GET['page_order']) ? (int)$_GET['page_order'] : 1;
if ($page_order < 1) $page_order = 1;
$offset_order = ($page_order - 1) * $limit;
$where_clause = "";
$date_params = [];
$date_types = "";
if (!empty($start_date) && !empty($end_date)) {
    $where_clause = " AND date BETWEEN ? AND ?";
    $date_params = [$start_date, $end_date];
    $date_types = "ss";
}

// --- কাস্টমারের ধরন চেক (নতুন) ---
$sql_check_type = "SELECT payment_type FROM prepayments 
                   WHERE customer_id = ? 
                   AND payment_type IN ('portal_0', 'personal_0', 'portal_2.5', 'personal_2.5')
                   ORDER BY date DESC, id DESC LIMIT 1";
$stmt_check_type = $mysqli->prepare($sql_check_type);
$stmt_check_type->bind_param("i", $customer_id);
$stmt_check_type->execute();
$result_type = $stmt_check_type->get_result();
$is_0_percent_customer = false; // ডিফল্ট
if ($result_type->num_rows === 1) {
    $last_type = $result_type->fetch_assoc()['payment_type'];
    if ($last_type == 'portal_0' || $last_type == 'personal_0') {
        $is_0_percent_customer = true;
    }
}
$stmt_check_type->close();
// --- কাস্টমার ধরন চেক শেষ ---


// --- স্ট্যাটাস কার্ডের ডেটা ---
$customer_id_param = [$customer_id];
function execute_dynamic_query($mysqli, $sql, $base_types, $base_params, $date_types, $date_params) {
    $stmt = $mysqli->prepare($sql);
    $types = $base_types . $date_types;
    $bind_params = []; $bind_params[] = &$types;
    foreach ($base_params as $key => $value) $bind_params[] = &$base_params[$key];
    foreach ($date_params as $key => $value) $bind_params[] = &$date_params[$key];
    if (!empty($types)) call_user_func_array([$stmt, 'bind_param'], $bind_params);
    $stmt->execute();
    return $stmt->get_result();
}
$sql_balance = "SELECT wallet_balance FROM customers WHERE id = ?";
$stmt_balance = $mysqli->prepare($sql_balance);
$stmt_balance->bind_param("i", $customer_id);
$stmt_balance->execute();
$wallet_balance = $stmt_balance->get_result()->fetch_assoc()['wallet_balance'] ?? 0.00;
$stmt_balance->close();
$sql_total_prepayment = "SELECT SUM(amount_paid) AS total FROM prepayments WHERE customer_id = ? AND payment_type IN ('portal_2.5', 'personal_2.5', 'portal_0', 'personal_0')" . $where_clause;
$total_prepayment = execute_dynamic_query($mysqli, $sql_total_prepayment, "i", $customer_id_param, $date_types, $date_params)->fetch_assoc()['total'] ?? 0.00;
$sql_total_order_usd = "SELECT SUM(amount_usd) AS total FROM orders WHERE customer_id = ?" . $where_clause;
$total_order_usd = execute_dynamic_query($mysqli, $sql_total_order_usd, "i", $customer_id_param, $date_types, $date_params)->fetch_assoc()['total'] ?? 0.00;
$sql_total_order_bdt = "SELECT SUM(bdt_amount) AS total FROM orders WHERE customer_id = ?" . $where_clause;
$total_order_bdt = execute_dynamic_query($mysqli, $sql_total_order_bdt, "i", $customer_id_param, $date_types, $date_params)->fetch_assoc()['total'] ?? 0.00;

// এই হিসাবগুলো শুধু 0% কাস্টমারের জন্য করা হবে
$pending_cust_comm = 0.00;
$completed_cust_comm = 0.00;
if ($is_0_percent_customer) {
    $sql_pending_cust_comm = "SELECT SUM(customer_commission) AS total FROM orders WHERE customer_id = ? AND customer_commission_status = 'pending'" . $where_clause;
    $pending_cust_comm = execute_dynamic_query($mysqli, $sql_pending_cust_comm, "i", $customer_id_param, $date_types, $date_params)->fetch_assoc()['total'] ?? 0.00;
    $sql_completed_cust_comm = "SELECT SUM(customer_commission) AS total FROM orders WHERE customer_id = ? AND customer_commission_status = 'completed'" . $where_clause;
    $completed_cust_comm = execute_dynamic_query($mysqli, $sql_completed_cust_comm, "i", $customer_id_param, $date_types, $date_params)->fetch_assoc()['total'] ?? 0.00;
}

// --- প্রি-পেমেন্ট টেবিল এবং পেজিনেশন ---
$sql_count_prep = "SELECT COUNT(*) AS total FROM prepayments WHERE customer_id = ? AND payment_type NOT IN ('commission_bonus', 'admin_fee')" . $where_clause;
$total_rows_prepayment = execute_dynamic_query($mysqli, $sql_count_prep, "i", $customer_id_param, $date_types, $date_params)->fetch_assoc()['total'] ?? 0;
$total_pages_prepayment = ceil($total_rows_prepayment / $limit);
$sql_prepayments = "SELECT date, payment_type, amount_paid, investment_amount, flat_fee_amount, amount_credited 
                    FROM prepayments 
                    WHERE customer_id = ? AND payment_type NOT IN ('commission_bonus', 'admin_fee')
                    " . $where_clause . "
                    ORDER BY date DESC, id DESC
                    LIMIT ? OFFSET ?";
$stmt_prepayments = $mysqli->prepare($sql_prepayments);
$prep_types = "i" . $date_types . "ii";
$prep_params = array_merge($customer_id_param, $date_params, [$limit, $offset_prepayment]);
$bind_prep_params = []; $bind_prep_params[] = &$prep_types;
foreach ($prep_params as $key => $value) $bind_prep_params[] = &$prep_params[$key];
call_user_func_array([$stmt_prepayments, 'bind_param'], $bind_prep_params);
$stmt_prepayments->execute();
$prepayments_log = $stmt_prepayments->get_result();

// --- অর্ডার টেবিল এবং পেজিনেশন ---
$sql_count_order = "SELECT COUNT(*) AS total FROM orders WHERE customer_id = ?" . $where_clause;
$total_rows_order = execute_dynamic_query($mysqli, $sql_count_order, "i", $customer_id_param, $date_types, $date_params)->fetch_assoc()['total'] ?? 0;
$total_pages_order = ceil($total_rows_order / $limit);
$sql_orders = "SELECT date, amount_usd, mg_rate, bdt_amount 
                FROM orders 
                WHERE customer_id = ? 
                " . $where_clause . "
                ORDER BY date DESC, id DESC
                LIMIT ? OFFSET ?";
$stmt_orders = $mysqli->prepare($sql_orders);
$order_types = "i" . $date_types . "ii";
$order_params = array_merge($customer_id_param, $date_params, [$limit, $offset_order]);
$bind_order_params = []; $bind_order_params[] = &$order_types;
foreach ($order_params as $key => $value) $bind_order_params[] = &$order_params[$key];
call_user_func_array([$stmt_orders, 'bind_param'], $bind_order_params);
$stmt_orders->execute();
$orders_log = $stmt_orders->get_result();

// পেজিনেশন লিঙ্ক তৈরির জন্য হেল্পার ফাংশন
function build_pagination_links($total_pages, $current_page, $page_param_name, $start_date, $end_date) {
    $links = ""; $other_params = [];
    if (isset($_GET['page_prepayment']) && $page_param_name != 'page_prepayment') $other_params['page_prepayment'] = $_GET['page_prepayment'];
    if (isset($_GET['page_order']) && $page_param_name != 'page_order') $other_params['page_order'] = $_GET['page_order'];
    if (!empty($start_date)) $other_params['start_date'] = $start_date;
    if (!empty($end_date)) $other_params['end_date'] = $end_date;
    $query_params = http_build_query($other_params);
    if (!empty($query_params)) $query_params = "&" . $query_params;
    for ($i = 1; $i <= $total_pages; $i++) {
        $active_class = ($i == $current_page) ? 'active' : '';
        $links .= "<a href='?{$page_param_name}={$i}{$query_params}' class='{$active_class}'>{$i}</a>";
    }
    return $links;
}
?>

<div class="card">
    <div class="card-body">
        <form action="customer_dashboard.php" method="GET" class="filter-form">
            <div class="form-group"><label for="start_date">শুরুর তারিখ:</label><input type="date" id="start_date" name="start_date" value="<?php echo htmlspecialchars($start_date); ?>" class="form-control"></div>
            <div class="form-group"><label for="end_date">শেষ তারিখ:</label><input type="date" id="end_date" name="end_date" value="<?php echo htmlspecialchars($end_date); ?>" class="form-control"></div>
            <button type="submit" class="btn btn-primary">ফিল্টার</button>
            <a href="customer_dashboard.php" class="btn" style="background-color: #6c757d; color: white;">রিসেট</a>
        </form>
    </div>
</div>

<div class="dashboard-grid">
    <div class="stat-card balance"><h3>বর্তমান ওয়ালেট ব্যালেন্স</h3><div class="value">$<?php echo number_format($wallet_balance, 2); ?></div></div>
    
    <?php if ($is_0_percent_customer): // --- নতুন 'if' কন্ডিশন --- ?>
    <div class="stat-card" style="border-left: 5px solid #e74c3c;">
        <h3>আমার পেন্ডিং কমিশন (৩%)</h3>
        <div class="value">$<?php echo number_format($pending_cust_comm, 2); ?></div>
    </div>
    <div class="stat-card" style="border-left: 5px solid #1abc9c;">
        <h3>আমার মোট প্রাপ্ত কমিশন</h3>
        <div class="value">$<?php echo number_format($completed_cust_comm, 2); ?></div>
    </div>
    <?php endif; // --- 'if' কন্ডিশন শেষ --- ?>

    <div class="stat-card prepayment"><h3>টোটাল প্রি-পেমেন্ট (ফিল্টারড)</h3><div class="value">$<?php echo number_format($total_prepayment, 2); ?></div></div>
    <div class="stat-card order-usd"><h3>টোটাল অর্ডার (USD) (ফিল্টারড)</h3><div class="value">$<?php echo number_format($total_order_usd, 2); ?></div></div>
    <div class="stat-card order-bdt"><h3>টোটাল অর্ডার (BDT) (ফিল্টারড)</h3><div class="value"><?php echo number_format($total_order_bdt, 2); ?> BDT</div></div>
</div>

<div class="card">
    <div class="card-header"><h2>আমার প্রি-পেমেন্ট হিস্ট্রি</h2></div>
    <div class="card-body">
        <table>
            <thead>
                <tr>
                    <th>তারিখ</th> <th>টাইপ</th> <th>আপনি দিয়েছেন</th>
                    <th>বোনাস/ফি</th> <th>ওয়ালেটে যোগ</th>
                </tr>
            </thead>
            <tbody>
                <?php
                if ($prepayments_log && $prepayments_log->num_rows > 0) {
                    while ($log = $prepayments_log->fetch_assoc()) {
                        $bonus_fee = $log['investment_amount'] - $log['flat_fee_amount'];
                        $type_display = '';
                        switch ($log['payment_type']) {
                            case 'portal_2.5': $type_display = 'Portal (2.5%)'; break;
                            case 'personal_2.5': $type_display = 'Personal (2.5%)'; break;
                            case 'portal_0': $type_display = 'Portal (0%)'; break;
                            case 'personal_0': $type_display = 'Personal (0%)'; break;
                        }
                        echo "<tr>";
                        echo "<td>" . date("d M, Y", strtotime($log['date'])) . "</td>";
                        echo "<td>" . $type_display . "</td>";
                        echo "<td>$" . number_format($log['amount_paid'], 2) . "</td>";
                        echo "<td>$" . number_format($bonus_fee, 2) . "</td>";
                        echo "<td><strong>$" . number_format($log['amount_credited'], 2) . "</strong></td>";
                        echo "</tr>";
                    }
                } else {
                    echo "<tr><td colspan='5'>এই ফিল্টারে কোনো প্রি-পেমেন্ট খুঁজে পাওয়া যায়নি।</td></tr>";
                }
                ?>
            </tbody>
        </table>
        <div class="pagination">
            <?php echo build_pagination_links($total_pages_prepayment, $page_prepayment, 'page_prepayment', $start_date, $end_date); ?>
        </div>
    </div>
</div>

<div class="card">
    <div class="card-header"><h2>আমার অর্ডার হিস্ট্রি</h2></div>
    <div class="card-body">
        <table>
            <thead>
                <tr>
                    <th>তারিখ</th> <th>অর্ডার (USD)</th> <th>MG রেট</th> <th>BDT পেয়েছেন</th>
                </tr>
            </thead>
            <tbody>
                <?php
                if ($orders_log && $orders_log->num_rows > 0) {
                    while ($log = $orders_log->fetch_assoc()) {
                        echo "<tr>";
                        echo "<td>" . date("d M, Y", strtotime($log['date'])) . "</td>";
                        echo "<td><strong>$" . number_format($log['amount_usd'], 2) . "</strong></td>";
                        echo "<td>" . number_format($log['mg_rate'], 4) . "</td>";
                        echo "<td>" . number_format($log['bdt_amount'], 2) . " BDT</td>";
                        echo "</tr>";
                    }
                } else {
                    echo "<tr><td colspan='4'>এই ফিল্টারে কোনো অর্ডার খুঁজে পাওয়া যায়নি।</td></tr>";
                }
                ?>
            </tbody>
        </table>
        <div class="pagination">
            <?php echo build_pagination_links($total_pages_order, $page_order, 'page_order', $start_date, $end_date); ?>
        </div>
    </div>
</div>

<?php
include 'customer_footer.php'; // ফুটার ফাইল
?>