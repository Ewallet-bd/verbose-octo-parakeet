<?php
// হেডার ফাইলটি অন্তর্ভুক্ত করি (এটিতেই লগইন চেক ও মেন্যু আছে)
include 'admin_header.php';

// --- ড্যাশবোর্ডের হিসাব-নিকাশ শুরু ---

$customer_id = $_GET['customer_id'] ?? '';
$start_date = $_GET['start_date'] ?? '';
$end_date = $_GET['end_date'] ?? '';

// কাস্টমার ড্রপডাউনের জন্য
$customers_list_result = $mysqli->query("SELECT id, full_name FROM customers ORDER BY full_name ASC");

// --- হেল্পার ফাংশন (Prepared Statement সহজ করার জন্য) ---
function fetch_dashboard_stat($mysqli, $sql, $types, $params) {
    $stmt = $mysqli->prepare($sql);
    if (!empty($types)) {
        $bind_params = [];
        $bind_params[] = &$types;
        foreach ($params as $key => $value) {
            $bind_params[] = &$params[$key];
        }
        call_user_func_array([$stmt, 'bind_param'], $bind_params);
    }
    $stmt->execute();
    return $stmt->get_result()->fetch_assoc()['total'] ?? 0.00;
}

// --- ডাইনামিক SQL প্রস্তুত করা ---
$params = [];
$types = "";
$where_clause_prep = ""; // Prepayments টেবিলের জন্য
$where_clause_order = ""; // Orders টেবিলের জন্য

if (!empty($customer_id)) {
    $where_clause_prep .= " AND customer_id = ?";
    $where_clause_order .= " AND customer_id = ?";
    $params[] = $customer_id;
    $types .= "i";
}
if (!empty($start_date) && !empty($end_date)) {
    $where_clause_prep .= " AND date BETWEEN ? AND ?";
    $where_clause_order .= " AND date BETWEEN ? AND ?";
    $params[] = $start_date;
    $params[] = $end_date;
    $types .= "ss";
}

// --- সকল কার্ডের হিসাব ---

// বকেয়া ইনভেস্টমেন্ট (২.৫%)
$sql_pending_inv = "SELECT SUM(investment_amount) AS total FROM prepayments WHERE investment_status = 'pending'" . $where_clause_prep;
$pending_inv = fetch_dashboard_stat($mysqli, $sql_pending_inv, $types, $params);

// বকেয়া অ্যাডমিন কমিশন (০.৫%)
$sql_pending_comm = "SELECT SUM(commission_amount) AS total FROM orders WHERE commission_status = 'pending'" . $where_clause_order;
$pending_comm = fetch_dashboard_stat($mysqli, $sql_pending_comm, $types, $params);

// মোট ফ্ল্যাট ফি ($1)
$sql_flat_fee = "SELECT SUM(flat_fee_amount) AS total FROM prepayments WHERE payment_type = 'personal_2.5' OR payment_type = 'personal_0'" . $where_clause_prep;
$total_flat_fee = fetch_dashboard_stat($mysqli, $sql_flat_fee, $types, $params);

// প্রাপ্ত ইনভেস্টমেন্ট (২.৫%)
$sql_received_inv = "SELECT SUM(investment_amount) AS total FROM prepayments WHERE investment_status = 'received'" . $where_clause_prep;
$received_inv = fetch_dashboard_stat($mysqli, $sql_received_inv, $types, $params);

// --- START: দুটি নতুন কার্ডের হিসাব ---

// প্রাপ্ত অ্যাডমিন ফি (BDT-ভিত্তিক)
// (এটি 0% কাস্টমারের অর্ডার থেকে আসে এবং স্ট্যাটাস 'received' থাকে)
$sql_received_fee = "SELECT SUM(commission_amount) AS total FROM orders 
                     WHERE commission_status = 'received' 
                     AND commission_amount > 0 
                     AND customer_commission > 0" . $where_clause_order; // customer_commission > 0 মানে এটি 0% কাস্টমার
$received_bdt_fee = fetch_dashboard_stat($mysqli, $sql_received_fee, $types, $params);

// প্রাপ্ত কমিশন (০.৫%)
// (এটি 2.5% কাস্টমারের অর্ডার থেকে আসে এবং স্ট্যাটাস 'received' থাকে)
$sql_received_comm = "SELECT SUM(commission_amount) AS total FROM orders 
                      WHERE commission_status = 'received' 
                      AND commission_amount > 0 
                      AND customer_commission = 0" . $where_clause_order; // customer_commission = 0 মানে এটি 2.5% কাস্টমার
$received_comm = fetch_dashboard_stat($mysqli, $sql_received_comm, $types, $params);

// --- END: পরিবর্তন ---


// মোট পেন্ডিং কাস্টমার কমিশন (৩%)
$sql_pending_cust_comm = "SELECT SUM(customer_commission) AS total FROM orders WHERE customer_commission_status = 'pending'" . $where_clause_order;
$pending_cust_comm = fetch_dashboard_stat($mysqli, $sql_pending_cust_comm, $types, $params);

// মোট কমপ্লিট কাস্টমার কমিশন (৩%)
$sql_completed_cust_comm = "SELECT SUM(customer_commission) AS total FROM orders WHERE customer_commission_status = 'completed'" . $where_clause_order;
$completed_cust_comm = fetch_dashboard_stat($mysqli, $sql_completed_cust_comm, $types, $params);

// --- এই হিসাবগুলো ফিল্টার ছাড়া (সর্বমোট) ---
$sql_total_customers = "SELECT COUNT(id) AS total FROM customers";
$total_customers = fetch_dashboard_stat($mysqli, $sql_total_customers, "", []);
$sql_total_balance = "SELECT SUM(wallet_balance) AS total_balance FROM customers";
$total_wallet_balance = $mysqli->query($sql_total_balance)->fetch_assoc()['total_balance'] ?? 0.00;

?>

<style>
.dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
}
.stat-card {
    background-color: #ffffff; padding: 1.5rem; border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.05);
}
.stat-card h3 {
    margin: 0 0 0.5rem 0; font-size: 1rem; color: #555; font-weight: 600;
}
.stat-card .value {
    font-size: 2rem; font-weight: bold; color: #333;
}
.stat-card.pending-inv { border-left: 5px solid #f39c12; }
.stat-card.pending-comm { border-left: 5px solid #e74c3c; }
.stat-card.total-fee { border-left: 5px solid #2ecc71; }
.stat-card.total-customers { border-left: 5px solid #3498db; }
.stat-card.total-balance { border-left: 5px solid #9b59b6; }
.stat-card.received { border-left: 5px solid #1abc9c; }
.stat-card.cust-comm-pending { border-left: 5px solid #e74c3c; }
.stat-card.cust-comm-comp { border-left: 5px solid #1abc9c; }
.filter-form {
    display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-end;
}
.filter-form .form-group { margin-bottom: 0; flex: 1; min-width: 200px; }
.filter-form .btn { flex-shrink: 0; height: 40px; }
</style>

<div class="welcome-message">
    <h2>স্বাগতম, <strong><?php echo htmlspecialchars($_SESSION['admin_username']); ?></strong>!</h2>
</div>

<div class="card">
    <div class="card-body">
        <form action="admin_dashboard.php" method="GET" class="filter-form">
            <div class="form-group">
                <label for="customer_id">কাস্টমার:</label>
                <select id="customer_id" name="customer_id" class="form-control">
                    <option value="">-- সকল কাস্টমার --</option>
                    <?php
                    if ($customers_list_result->num_rows > 0) {
                        while ($customer = $customers_list_result->fetch_assoc()) {
                            $selected = ($customer_id == $customer['id']) ? 'selected' : '';
                            echo '<option value="' . $customer['id'] . '" ' . $selected . '>' . htmlspecialchars($customer['full_name']) . '</option>';
                        }
                    }
                    ?>
                </select>
            </div>
            <div class="form-group">
                <label for="start_date">শুরুর তারিখ:</label>
                <input type="date" id="start_date" name="start_date" value="<?php echo htmlspecialchars($start_date); ?>" class="form-control">
            </div>
            <div class="form-group">
                <label for="end_date">শেষ তারিখ:</label>
                <input type="date" id="end_date" name="end_date" value="<?php echo htmlspecialchars($end_date); ?>" class="form-control">
            </div>
            <button type="submit" class="btn btn-primary">ফিল্টার</button>
            <a href="admin_dashboard.php" class="btn" style="background-color: #6c757d;">রিসেট</a>
        </form>
    </div>
</div>

<div class="dashboard-grid">
    <div class="stat-card cust-comm-pending">
        <h3>মোট পেন্ডিং কাস্টমার কমিশন (৩%)</h3>
        <div class="value">$<?php echo number_format($pending_cust_comm, 2); ?></div>
    </div>
    <div class="stat-card cust-comm-comp">
        <h3>মোট কমপ্লিট কাস্টমার কমিশন (৩%)</h3>
        <div class="value">$<?php echo number_format($completed_cust_comm, 2); ?></div>
    </div>
    <div class="stat-card pending-inv">
        <h3>বকেয়া ইনভেস্টমেন্ট (২.৫%)</h3>
        <div class="value">$<?php echo number_format($pending_inv, 2); ?></div>
    </div>
    <div class="stat-card pending-comm">
        <h3>বকেয়া অ্যাডমিন কমিশন (০.৫%)</h3>
        <div class="value">$<?php echo number_format($pending_comm, 2); ?></div>
    </div>
    <div class="stat-card total-fee">
        <h3>মোট ফ্ল্যাট ফি ($1)</h3>
        <div class="value">$<?php echo number_format($total_flat_fee, 2); ?></div>
    </div>
    <div class="stat-card received">
        <h3>প্রাপ্ত ইনভেস্টমেন্ট (২.৫%)</h3>
        <div class="value">$<?php echo number_format($received_inv, 2); ?></div>
    </div>
    
    <div class="stat-card received">
        <h3>প্রাপ্ত অ্যাডমিন ফি (BDT-ভিত্তিক)</h3>
        <div class="value">$<?php echo number_format($received_bdt_fee, 2); ?></div>
    </div>
    <div class="stat-card received">
        <h3>প্রাপ্ত কমিশন (০.৫%)</h3>
        <div class="value">$<?php echo number_format($received_comm, 2); ?></div>
    </div>
    <div class="stat-card total-customers">
        <h3>মোট কাস্টমার (সর্বমোট)</h3>
        <div class="value"><?php echo $total_customers; ?></div>
    </div>
    <div class="stat-card total-balance">
        <h3>মোট ওয়ালেট ব্যালেন্স (সর্বমোট)</h3>
        <div class="value">$<?php echo number_format($total_wallet_balance, 2); ?></div>
    </div>
</div>

<?php
include 'admin_footer.php';
?>