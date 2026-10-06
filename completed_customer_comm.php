<?php
include 'admin_header.php'; // হেডার ফাইল

// --- PHP: ফিল্টার লজিক ---
$filter_customer_id = $_GET['customer_id'] ?? '';
$filter_start_date = $_GET['start_date'] ?? '';
$filter_end_date = $_GET['end_date'] ?? '';

// কাস্টমার ড্রপডাউনের জন্য
$customers_list_for_filter = $mysqli->query("SELECT id, full_name FROM customers ORDER BY full_name ASC");

$sql_log = "SELECT o.*, c.full_name 
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            WHERE o.customer_commission > 0 AND o.customer_commission_status = 'completed'"; // শুধু কমপ্লিট ৩% কমিশন

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
$sql_log .= " ORDER BY o.date DESC, o.id DESC"; // নতুনগুলো আগে দেখাবে

$stmt_log = $mysqli->prepare($sql_log);
if (!empty($types)) {
    $bind_params = [];
    $bind_params[] = &$types;
    foreach ($params as $key => $value) { $bind_params[] = &$params[$key]; }
    call_user_func_array([$stmt_log, 'bind_param'], $bind_params);
}
$stmt_log->execute();
$completed_commissions = $stmt_log->get_result();

?>

<div class="card">
    <div class="card-header"><h2>কমপ্লিট কমিশন (৩%) ফিল্টার করুন</h2></div>
    <div class="card-body">
        <form action="completed_customer_comm.php" method="GET" class="filter-form" style="display: flex; gap: 1rem; align-items: flex-end;">
            <div class="form-group" style="flex: 1;"><label for="customer_id_filter">কাস্টমার:</label>
                <select id="customer_id_filter" name="customer_id" class="form-control">
                    <option value="">-- সকল কাস্টমার --</option>
                    <?php if ($customers_list_for_filter->num_rows > 0) { while ($customer = $customers_list_for_filter->fetch_assoc()) { $selected = ($filter_customer_id == $customer['id']) ? 'selected' : ''; echo '<option value="' . $customer['id'] . '" ' . $selected . '>' . htmlspecialchars($customer['full_name']) . '</option>'; } } ?>
                </select>
            </div>
            <div class="form-group" style="flex: 1;"><label for="start_date_filter">শুরুর তারিখ:</label><input type="date" id="start_date_filter" name="start_date" value="<?php echo htmlspecialchars($filter_start_date); ?>" class="form-control"></div>
            <div class="form-group" style="flex: 1;"><label for="end_date_filter">শেষ তারিখ:</label><input type="date" id="end_date_filter" name="end_date" value="<?php echo htmlspecialchars($filter_end_date); ?>" class="form-control"></div>
            <button type="submit" class="btn btn-primary">ফিল্টার</button>
            <a href="completed_customer_comm.php" class="btn btn-secondary">রিসেট</a>
        </form>
    </div>
</div>

<div class="card">
    <div class="card-header">
        <h2>কমপ্লিট কাস্টমার কমিশন (৩%) লগ</h2>
    </div>
    <div class="card-body">
        <table style="font-size: 0.9rem;">
            <thead>
                <tr>
                    <th>তারিখ</th>
                    <th>কাস্টমার</th>
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
                        echo "<td>" . htmlspecialchars($row['full_name']) . "</td>";
                        echo "<td><strong>" . htmlspecialchars($row['custom_id']) . "</strong></td>";
                        echo "<td>$" . number_format($row['amount_usd'], 2) . "</td>";
                        echo "<td><strong>$" . number_format($row['customer_commission'], 2) . "</strong></td>";
                        echo "<td><span style='color:green; font-weight: bold;'>" . ucfirst($row['customer_commission_status']) . "</span></td>";
                        echo "</tr>";
                    }
                } else {
                    echo "<tr><td colspan='6'>কোনো কমপ্লিট কাস্টমার কমিশন পাওয়া যায়নি।</td></tr>";
                }
                ?>
            </tbody>
        </table>
    </div>
</div>

<?php
include 'admin_footer.php'; // ফুটার ফাইল
?>