<?php
include 'admin_header.php'; // হেডার ফাইল

$success_message = '';
$error_message = '';

// PHP: ইনভেস্টমেন্ট 'Received' করার লজিক
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['mark_investment_received'])) {
    $prepayment_id = $_POST['prepayment_id'];
    
    $sql = "UPDATE prepayments SET investment_status = 'received' WHERE id = ? AND investment_status = 'pending'";
    $stmt = $mysqli->prepare($sql);
    $stmt->bind_param("i", $prepayment_id);
    
    if ($stmt->execute()) {
        $success_message = "ইনভেস্টমেন্ট #" . $prepayment_id . " সফলভাবে 'Received' মার্ক করা হয়েছে।";
    } else {
        $error_message = "ত্রুটি: " . $stmt->error;
    }
    $stmt->close();
}

// PHP: কমিশন 'Received' করার লজিক
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['mark_commission_received'])) {
    $order_id = $_POST['order_id'];
    
    $sql = "UPDATE orders SET commission_status = 'received' WHERE id = ? AND commission_status = 'pending'";
    $stmt = $mysqli->prepare($sql);
    $stmt->bind_param("i", $order_id);
    
    if ($stmt->execute()) {
        $success_message = "কমিশন #" . $order_id . " সফলভাবে 'Received' মার্ক করা হয়েছে।";
    } else {
        $error_message = "ত্রুটি: " . $stmt->error;
    }
    $stmt->close();
}


// PHP: সকল 'Pending' ইনভেস্টমেন্ট (2.5%) লোড করি
$pending_investments = $mysqli->query("SELECT p.*, c.full_name 
                                        FROM prepayments p
                                        JOIN customers c ON p.customer_id = c.id
                                        WHERE p.investment_status = 'pending'
                                        ORDER BY p.date ASC");

// PHP: সকল 'Pending' কমিশন (0.5%) লোড করি
$pending_commissions = $mysqli->query("SELECT o.*, c.full_name 
                                        FROM orders o
                                        JOIN customers c ON o.customer_id = c.id
                                        WHERE o.commission_status = 'pending'
                                        ORDER BY o.date ASC");

?>

<?php if ($success_message): ?>
    <div class="alert alert-success"><?php echo $success_message; ?></div>
<?php endif; ?>
<?php if ($error_message): ?>
    <div class="alert alert-danger"><?php echo $error_message; ?></div>
<?php endif; ?>


<div class="card">
    <div class="card-header">
        <h2>বকেয়া ইনভেস্টমেন্ট (Pending 2.5% Investments)</h2>
    </div>
    <div class="card-body">
        <table>
            <thead>
                <tr>
                    <th>তারিখ</th>
                    <th>কাস্টমার</th>
                    <th>প্রি-পেমেন্ট (USD)</th>
                    <th>ইনভেস্টমেন্ট (2.5%)</th>
                    <th>স্ট্যাটাস</th>
                    <th>অ্যাকশন</th>
                </tr>
            </thead>
            <tbody>
                <?php
                if ($pending_investments->num_rows > 0) {
                    while ($row = $pending_investments->fetch_assoc()) {
                        echo "<tr>";
                        echo "<td>" . date("d M, Y", strtotime($row['date'])) . "</td>";
                        echo "<td>" . htmlspecialchars($row['full_name']) . "</td>";
                        echo "<td>$" . number_format($row['amount_paid'], 2) . "</td>";
                        echo "<td><strong>$" . number_format($row['investment_amount'], 2) . "</strong></td>";
                        echo "<td>" . $row['investment_status'] . "</td>";
                        // 'Mark Received' বাটন
                        echo '<td>
                                <form action="reconciliation.php" method="POST" style="margin:0;">
                                    <input type="hidden" name="prepayment_id" value="' . $row['id'] . '">
                                    <button type="submit" name="mark_investment_received" class="btn btn-primary">Mark Received</button>
                                </form>
                              </td>';
                        echo "</tr>";
                    }
                } else {
                    echo "<tr><td colspan='6'>কোনো বকেয়া ইনভেস্টমেন্ট নেই।</td></tr>";
                }
                ?>
            </tbody>
        </table>
    </div>
</div>

<div class="card">
    <div class="card-header">
        <h2>বকেয়া কমিশন (Pending 0.5% Commissions)</h2>
    </div>
    <div class="card-body">
        <table>
            <thead>
                <tr>
                    <th>তারিখ</th>
                    <th>কাস্টমার</th>
                    <th>অর্ডার (USD)</th>
                    <th>কমিশন (0.5%)</th>
                    <th>স্ট্যাটাস</th>
                    <th>অ্যাকশন</th>
                </tr>
            </thead>
            <tbody>
                <?php
                if ($pending_commissions->num_rows > 0) {
                    while ($row = $pending_commissions->fetch_assoc()) {
                        echo "<tr>";
                        echo "<td>" . date("d M, Y", strtotime($row['date'])) . "</td>";
                        echo "<td>" . htmlspecialchars($row['full_name']) . "</td>";
                        echo "<td>$" . number_format($row['amount_usd'], 2) . "</td>";
                        echo "<td><strong>$" . number_format($row['commission_amount'], 2) . "</strong></td>";
                        echo "<td>" . $row['commission_status'] . "</td>";
                        // 'Mark Received' বাটন
                        echo '<td>
                                <form action="reconciliation.php" method="POST" style="margin:0;">
                                    <input type="hidden" name="order_id" value="' . $row['id'] . '">
                                    <button type="submit" name="mark_commission_received" class="btn btn-primary">Mark Received</button>
                                </form>
                              </td>';
                        echo "</tr>";
                    }
                } else {
                    echo "<tr><td colspan='6'>কোনো বকেয়া কমিশন নেই।</td></tr>";
                }
                ?>
            </tbody>
        </table>
    </div>
</div>


<?php
include 'admin_footer.php'; // ফুটার ফাইল
?>