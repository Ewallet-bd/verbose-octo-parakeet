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
    $where_clause = " AND o.date BETWEEN ? AND ?";
    $date_params = [$start_date, $end_date];
    $date_types = "ss";
}
$customer_id_param = [$customer_id];

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

// --- কমপ্লিট কমিশন টেবিল এবং পেজিনেশন ---
$sql_count = "SELECT COUNT(*) AS total FROM orders o 
              WHERE o.customer_id = ? AND o.customer_commission > 0 AND o.customer_commission_status = 'completed'" . $where_clause;
$total_rows = execute_dynamic_query($mysqli, $sql_count, "i", $customer_id_param, $date_types, $date_params)->fetch_assoc()['total'] ?? 0;
$total_pages = ceil($total_rows / $limit);

$sql_log = "SELECT o.date, o.custom_id, o.amount_usd, o.customer_commission, o.customer_commission_status
            FROM orders o
            WHERE o.customer_id = ? AND o.customer_commission > 0 AND o.customer_commission_status = 'completed'
            " . $where_clause . "
            ORDER BY o.date DESC, o.id DESC
            LIMIT ? OFFSET ?";
$stmt_log = $mysqli->prepare($sql_log);
$log_types = "i" . $date_types . "ii";
$log_params = array_merge($customer_id_param, $date_params, [$limit, $offset]);
$bind_log_params = []; $bind_log_params[] = &$log_types;
foreach ($log_params as $key => $value) $bind_log_params[] = &$log_params[$key];
call_user_func_array([$stmt_log, 'bind_param'], $bind_log_params);
$stmt_log->execute();
$completed_commissions = $stmt_log->get_result();


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
        <form action="customer_completed_comm.php" method="GET" class="filter-form">
            <div class="form-group"><label for="start_date">শুরুর তারিখ:</label><input type="date" id="start_date" name="start_date" value="<?php echo htmlspecialchars($start_date); ?>" class="form-control"></div>
            <div class="form-group"><label for="end_date">শেষ তারিখ:</label><input type="date" id="end_date" name="end_date" value="<?php echo htmlspecialchars($end_date); ?>" class="form-control"></div>
            <button type="submit" class="btn btn-primary">ফিল্টার</button>
            <a href="customer_completed_comm.php" class="btn btn-secondary">রিসেট</a>
        </form>
    </div>
</div>

<div class="card">
    <div class="card-header">
        <h2>আমার কমপ্লিট কমিশন (৩%) লগ</h2>
    </div>
    <div class="card-body">
        <table style="font-size: 0.9rem;">
            <thead>
                <tr>
                    <th>তারিখ</th>
                    <th>অর্ডার আইডি</th>
                    <th>অর্ডারের পরিমাণ</th>
                    <th>কমিশন (৩%)</th>
                    <th>স্ট্যাটাস</th>
                </tr>
            </thead>
            <tbody>
                <?php
                if ($completed_commissions->num_rows > 0) {
                    while ($row = $completed_commissions->fetch_assoc()) {
                        echo "<tr>";
                        echo "<td>" . date("d M, Y", strtotime($row['date'])) . "</td>";
                        echo "<td><strong>" . htmlspecialchars($row['custom_id']) . "</strong></td>";
                        echo "<td>$" . number_format($row['amount_usd'], 2) . "</td>";
                        echo "<td><strong>$" . number_format($row['customer_commission'], 2) . "</strong></td>";
                        echo "<td><span style='color:green; font-weight: bold;'>" . ucfirst($row['customer_commission_status']) . "</span></td>";
                        echo "</tr>";
                    }
                } else {
                    echo "<tr><td colspan='5'>এই ফিল্টারে কোনো কমপ্লিট কমিশন পাওয়া যায়নি।</td></tr>";
                }
                ?>
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