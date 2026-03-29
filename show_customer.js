const { getConnection } = require('./db');

async function showCustomers() {
  let connection;

  try {
    connection = await getConnection();
    console.log('Connected to Oracle!');

    const result = await connection.execute(
      `SELECT * FROM Customer ORDER BY customer_id`
    );

    console.log('Customer table data:');
    console.table(result.rows);

  } catch (err) {
    console.error(err);
  } finally {
    if (connection) await connection.close();
  }
}

showCustomers();

