const { getConnection, oracledb } = require('../config/db');

const qaModel = {
    async askQuestion(cid, pid, text) {
        let conn;
        try {
            conn = await getConnection();
            await conn.execute(
                `BEGIN sp_ask_question(:cid, :pid, :txt); END;`,
                { cid: Number(cid), pid: Number(pid), txt: text }
            );
            await conn.commit();
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
            const result = await conn.execute(
                `SELECT 
                    TO_CHAR(q.question_text) as question_text, 
                    q.question_date, 
                    TO_CHAR(a.answer_text) as answer_text, 
                    a.answer_date,
                    adm.name
                 FROM Question q
                 LEFT JOIN Answer a ON q.question_id = a.question_id
                 LEFT JOIN Admin adm ON a.admin_id = adm.admin_id
                 WHERE q.product_id = :pid
                 ORDER BY q.question_date DESC`,
                { pid: productId },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
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
                `BEGIN sp_answer_question(:qid, :aid, :txt); END;`,
                { qid: Number(qid), aid: Number(aid), txt: text }
            );
            await conn.commit();
            return { success: true };
        } catch (err) {
            if (conn) await conn.rollback();
            throw err;
        } finally {
            if (conn) await conn.close();
        }
    }
};

module.exports = qaModel;