<?php
include 'customer_header.php'; // কাস্টমার হেডার

// --- ফিল্টার এবং পেজিনেশন ভেরিয়েবল সেট করা ---
$customer_id = $_SESSION['customer_id'];
$limit = 10; // প্রতি পৃষ্ঠায় ১০টি আইটেম
$page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
if ($page < 1) $page = 1;
$offset = ($page - 1) * $limit;

$start_date = $_GET['start_date'] ?? '';
$end_date = $_GET['end_date'] ?? '';

// --- ফিল্টার প্যারামিটার প্রস্তুত করা ---
$where_clause = "";
$date_params = [];
$date_types = "";
if (!empty($start_date) && !empty($end_date)) {
    $where_clause = " AND date BETWEEN ? AND ?";
    $date_params = [$start_date, $end_date];
    $date_types = "ss";
}

// একটি হেল্পার ফাংশন
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
$customer_id_param = [$customer_id];

// --- নতুন স্টেটমেন্ট লজিক (আপডেটেড বিবরণ সহ) ---
$transactions = [];
$statement_rows = [];
$opening_balance = 0.00;

// ১. ওপেনিং ব্যালেন্স হিসাব
if (!empty($start_date)) {
    $sql_open_prep = "SELECT SUM(amount_credited) FROM prepayments WHERE customer_id = ? AND date < ?";
    $stmt_open_prep = $mysqli->prepare($sql_open_prep);
    $stmt_open_prep->bind_param("is", $customer_id, $start_date);
    $stmt_open_prep->execute();
    $opening_balance += $stmt_open_prep->get_result()->fetch_row()[0] ?? 0.00;
    
    $sql_open_order = "SELECT SUM(amount_usd) FROM orders WHERE customer_id = ? AND date < ?";
    $stmt_open_order = $mysqli->prepare($sql_open_order);
    $stmt_open_order->bind_param("is", $customer_id, $start_date);
    $stmt_open_order->execute();
    $opening_balance -= $stmt_open_order->get_result()->fetch_row()[0] ?? 0.00;
}
$running_balance = $opening_balance;

// ২. ফিল্টার করা লেনদেনগুলো আনা
// ২ক. প্রি-পেমেন্ট (জমা, বোনাস, ফি)
$sql_prepayments = "SELECT custom_id, date, created_at, payment_type, amount_paid, investment_amount, flat_fee_amount 
                    FROM prepayments 
                    WHERE customer_id = ? AND payment_type IN ('portal_2.5', 'personal_2.5', 'portal_0', 'personal_0')" . $where_clause . " ORDER BY date ASC, created_at ASC";
$result_prepayments = execute_dynamic_query($mysqli, $sql_prepayments, "i", $customer_id_param, $date_types, $date_params);
while ($row = $result_prepayments->fetch_assoc()) {
    $ppid = htmlspecialchars($row['custom_id']);
    // এন্ট্রি ১: মূল জমা
    $transactions[] = ['timestamp' => $row['created_at'], 'date' => $row['date'], 'description' => "Prepayment ({$ppid})", 'deposit' => (float)$row['amount_paid'], 'withdrawal' => 0];
    
    // এন্ট্রি ২: ইনভেস্টমেন্ট বোনাস (Commission হিসাবে)
    if ((float)$row['investment_amount'] > 0) {
        $transactions[] = ['timestamp' => date('Y-m-d H:i:s', strtotime($row['created_at']) + 1), 'date' => $row['date'], 'description' => "Commission ({$ppid})", 'deposit' => (float)$row['investment_amount'], 'withdrawal' => 0];
    }
    // এন্ট্রি ৩: ফ্ল্যাট ফি
    if ((float)$row['flat_fee_amount'] > 0) {
        $transactions[] = ['timestamp' => date('Y-m-d H:i:s', strtotime($row['created_at']) + 2), 'date' => $row['date'], 'description' => "প্রি-পেমেন্ট ফি ({$ppid})", 'deposit' => 0, 'withdrawal' => (float)$row['flat_fee_amount']];
    }
}
// ২খ. অর্ডার (উত্তোলন)
$sql_orders = "SELECT custom_id, date, created_at, amount_usd FROM orders WHERE customer_id = ?" . $where_clause . " ORDER BY date ASC, created_at ASC";
$result_orders = execute_dynamic_query($mysqli, $sql_orders, "i", $customer_id_param, $date_types, $date_params);
while ($row = $result_orders->fetch_assoc()) {
    $transactions[] = ['timestamp' => $row['created_at'], 'date' => $row['date'], 'description' => 'Order (' . htmlspecialchars($row['custom_id']) . ')', 'deposit' => 0, 'withdrawal' => $row['amount_usd']];
}
// ২গ. বোনাস ও ফি (অর্ডার সম্পর্কিত)
$sql_fees = "SELECT id, date, created_at, amount_credited, description FROM prepayments WHERE customer_id = ? AND payment_type IN ('commission_bonus', 'admin_fee')" . $where_clause . " ORDER BY date ASC, created_at ASC";
$result_fees = execute_dynamic_query($mysqli, $sql_fees, "i", $customer_id_param, $date_types, $date_params);
while ($row = $result_fees->fetch_assoc()) {
    $amount = (float)$row['amount_credited'];
    // `description` ফিল্ডটি ডাটাবেস থেকে সরাসরি আসছে (e.g., "কমিশন (OID1001)")
    $transactions[] = ['timestamp' => $row['created_at'], 'date' => $row['date'], 'description' => $row['description'], 'deposit' => ($amount > 0) ? $amount : 0, 'withdrawal' => ($amount < 0) ? abs($amount) : 0];
}

// ৩. সব লেনদেন সময় অনুযায়ী সাজানো
usort($transactions, function($a, $b) {
    return strtotime($a['timestamp']) <=> strtotime($b['timestamp']);
});

// ৪. রানিং ব্যালেন্স হিসাব
foreach ($transactions as $tx) {
    $running_balance += $tx['deposit'] - $tx['withdrawal'];
    $statement_rows[] = ['date' => $tx['date'], 'description' => $tx['description'], 'deposit' => $tx['deposit'], 'withdrawal' => $tx['withdrawal'], 'balance' => $running_balance];
}
// ৫. টেবিল উল্টো করা (নতুন থেকে পুরাতন)
$statement_rows = array_reverse($statement_rows);
// ৬. পেজিনেশন
$total_rows = count($statement_rows);
$total_pages = ceil($total_rows / $limit);
$paginated_rows = array_slice($statement_rows, $offset, $limit);

// পেজিনেশন লিঙ্ক
function build_pagination_links($total_pages, $current_page, $start_date, $end_date) {
    $links = ""; $query_params = http_build_query(['start_date' => $start_date, 'end_date' => $end_date]);
    if (!empty($query_params)) $query_params = "&" . $query_params;
    for ($i = 1; $i <= $total_pages; $i++) {
        $active_class = ($i == $current_page) ? 'active' : '';
        $links .= "<a href='?page={$i}{$query_params}' class='{$active_class}'>{$i}</a>";
    }
    return $links;
}
?>

<div class="card">
    <div class="card-body">
        <form action="customer_statement.php" method="GET" class="filter-form">
            <div class="form-group"><label for="start_date">শুরুর তারিখ:</label><input type="date" id="start_date" name="start_date" value="<?php echo htmlspecialchars($start_date); ?>" class="form-control"></div>
            <div class="form-group"><label for="end_date">শেষ তারিখ:</label><input type="date" id="end_date" name="end_date" value="<?php echo htmlspecialchars($end_date); ?>" class="form-control"></div>
            <button type="submit" class="btn btn-primary">ফিল্টার</button>
            <a href="customer_statement.php" class="btn btn-secondary">রিসেট</a>
        </form>
    </div>
</div>

<div class="card">
    <div class="card-header">
        <h2>আমার স্টেটমেন্ট</h2>
    </div>
    <div class="card-body">
        <table>
            <thead>
                <tr>
                    <th>তারিখ</th>
                    <th>বিবরণ</th>
                    <th>জমা (Deposit)</th>
                    <th>উত্তোলন (Withdrawal)</th>
                    <th>স্থিতিশীল (Balance)</th>
                </tr>
            </thead>
            <tbody>
                <?php if (!empty($start_date) && $page == $total_pages): // শুধু *শেষ* পেজে ওপেনিং ব্যালেন্স দেখান ?>
                <tr>
                    <td colspan="4" style="text-align: right; font-weight: bold;">Opening Balance (<?php echo date("d M, Y", strtotime($start_date)); ?> এর আগে)</td>
                    <td><strong>$<?php echo number_format($opening_balance, 2); ?></strong></td>
                </tr>
                <?php endif; ?>

                <?php if (count($paginated_rows) > 0): ?>
                    <?php foreach ($paginated_rows as $row): ?>
                    <tr>
                        <td><?php echo date("d M, Y", strtotime($row['date'])); ?></td>
                        <td><?php echo htmlspecialchars($row['description']); ?></td>
                        <td><?php echo ($row['deposit'] > 0 ? '$' . number_format($row['deposit'], 2) : '-'); ?></td>
                        <td><?php echo ($row['withdrawal'] > 0 ? '$' . number_format($row['withdrawal'], 2) : '-'); ?></td>
                        <td><strong>$<?php echo number_format($row['balance'], 2); ?></strong></td>
                    </tr>
                    <?php endforeach; ?>
                <?php else: ?>
                    <tr><td colspan="5">এই ফিল্টারে কোনো লেনদেন খুঁজে পাওয়া যায়নি।</td></tr>
                <?php endif; ?>
            </tbody>
        </table>
        <div class="pagination">
            <?php echo build_pagination_links($total_pages, $page, $start_date, $end_date); ?>
        </div>
    </div>
</div>

<?php
include 'customer_footer.php'; // ফুটার ফাইল
?>