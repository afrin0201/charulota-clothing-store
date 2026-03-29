const oracledb = require('oracledb');
const { getConnection } = require('./db');

async function run() {
  let connection;

  try {
      console.log('Connected to Oracle!');

    await connection.execute(
      `INSERT INTO Customer (customer_id, name, email, password, address)
       VALUES (:id, :name, :email, :password, :address)`,
      {
        id: 13,  
        name: 'Eleanor Unique',
        email: 'eleanor@example.com',
        password: 'pass999',
        address: '10 Unique St, Dhaka'
      }
    );

    await connection.execute(
      `INSERT INTO Customer (customer_id, name, email, password, address)
       VALUES (:id, :name, :email, :password, :address)`,
      {
        id: 12,
        name: 'Frederick Odd',
        email: 'frederick@example.com',
        password: 'pass888',
        address: '11 Strange Rd, Chittagong'
      }
    );

    await connection.commit();
    console.log('Manual rows inserted successfully!');

    
    const result = await connection.execute(`SELECT * FROM Customer ORDER BY customer_id`);
    console.log(result.rows);

  } catch (err) {
    console.error(err);
  } finally {
    if (connection) await connection.close();
  }
}

run();
