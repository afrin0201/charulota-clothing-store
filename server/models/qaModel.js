const { getConnection, oracledb } = require('../config/db');

const qaModel = {
   async askQuestion(cid, pid, text) {
    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute(
            `INSERT INTO Question (question_id, customer_id, product_id, question_text, question_date)
             VALUES (item_seq.NEXTVAL, :cid, :pid, :txt, SYSDATE)`,
            { cid, pid, txt: text }
        );
        
        await conn.commit(); 
        console.log("Rows inserted:", result.rowsAffected);
        return { success: true };
    } catch (err) {
        if (conn) await conn.rollback();
        console.error("Critical Failure:", err);
        throw err;
    } finally {
        if (conn) await conn.close();
    }
},
async getProductQA(productId) {
    let conn;
    try {
        conn = await getConnection();
        const query = `
            SELECT 
                TO_CHAR(q.question_text) as question_text, 
                q.question_date, 
                TO_CHAR(a.answer_text) as answer_text, 
                a.answer_date,
                adm.name
            FROM Question q
            LEFT JOIN Answer a ON q.question_id = a.question_id
            LEFT JOIN Admin adm ON a.admin_id = adm.admin_id
            WHERE q.product_id = :pid
            ORDER BY q.question_date DESC`;
        
        const result = await conn.execute(query, { pid: productId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return result.rows;
    } finally {
        if (conn) await conn.close();
    }
},
async getQuestionsForProduct(productId) {
    let conn;
    try {
        conn = await getConnection();
        const query = `
            SELECT 
                q.question_text, 
                q.question_date, 
                a.answer_text, 
                a.answer_date,
                adm.admin_name
            FROM Question q
            LEFT JOIN Answer a ON q.question_id = a.question_id
            LEFT JOIN Admin adm ON a.admin_id = adm.admin_id
            WHERE q.product_id = :pid
            ORDER BY q.question_date DESC`;
            
        const result = await conn.execute(query, { pid: productId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return result.rows;
    } finally {
        if (conn) await conn.close();
    }
},
    async answerQuestion(qid, aid, text) {
        let conn;
        try {
            conn = await getConnection();
            await conn.execute(
                `BEGIN submit_admin_answer(:qid, :aid, :txt); END;`,
                { qid, aid, txt: text }
            );
            return { success: true };
        } finally {
            if (conn) await conn.close();
        }
    }
};

module.exports = qaModel;