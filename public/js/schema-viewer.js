// ========================================================
// POSTGRESQL SCHEMA VIEWER & SQL QUERY RUNNER PLAYGROUND
// ========================================================

const sqlTemplates = {
  1: "SELECT * FROM constituents WHERE ward = 'Kilgoris Central' AND is_opted_out = false LIMIT 10;",
  2: "SELECT * FROM constituents WHERE ward = 'Narok Town' AND is_opted_out = false LIMIT 10;",
  3: "SELECT * FROM constituents WHERE is_opted_out = true LIMIT 10;",
  4: "SELECT * FROM sender_ids;"
};

function setQueryTemplate(id) {
  const textarea = document.getElementById('sqlQueryTextarea');
  if (textarea && sqlTemplates[id]) {
    textarea.value = sqlTemplates[id];
    executeCurrentSqlQuery();
  }
}

async function loadSchemaDdl() {
  const pre = document.getElementById('schemaPreBlock');
  if (!pre) return;

  try {
    const res = await fetch('/api/schema');
    const json = await res.json();
    if (json.success && json.schemaSql) {
      pre.textContent = json.schemaSql;
    }
  } catch (err) {
    console.error('Failed to load schema.sql:', err);
    pre.textContent = '-- Error loading schema.sql file';
  }
}

async function executeCurrentSqlQuery() {
  const textarea = document.getElementById('sqlQueryTextarea');
  const query = textarea ? textarea.value.trim() : '';

  if (!query) {
    window.showToast('Please type a SQL query to execute.', 'error');
    return;
  }

  const timeEl = document.getElementById('sqlExecutionTime');
  const planEl = document.getElementById('sqlPlanText');
  const tableHead = document.getElementById('sqlResultsHead');
  const tableBody = document.getElementById('sqlResultsBody');

  try {
    const res = await fetch('/api/sql-runner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    const json = await res.json();

    if (!json.success) {
      if (planEl) {
        planEl.textContent = `Error: ${json.error}`;
        planEl.style.color = 'var(--accent-red)';
      }
      window.showToast(json.error || 'SQL Error', 'error');
      return;
    }

    if (timeEl) {
      timeEl.innerHTML = `Execution Time: <strong style="color: var(--color-ivory);">${json.executionTimeMs} ms</strong> (${json.rowCount} rows)`;
    }

    if (planEl) {
      planEl.textContent = json.explanation;
      planEl.style.color = 'var(--accent-camel-light)';
    }

    // Populate Results Table
    if (tableHead && tableBody) {
      if (!json.rows || json.rows.length === 0) {
        tableHead.innerHTML = `<th>No rows returned</th>`;
        tableBody.innerHTML = `<tr><td style="color: var(--text-muted); padding: 1.5rem; text-align: center;">Query returned 0 records.</td></tr>`;
        return;
      }

      const columns = Object.keys(json.rows[0]);
      tableHead.innerHTML = columns.map(c => `<th>${c}</th>`).join('');

      tableBody.innerHTML = json.rows.map(row => `
        <tr>
          ${columns.map(col => {
            let val = row[col];
            if (typeof val === 'boolean') val = val ? 'TRUE' : 'FALSE';
            else if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
            return `<td class="${col.includes('phone') || col.includes('id') ? 'cell-mono' : ''}">${val !== null && val !== undefined ? val : 'NULL'}</td>`;
          }).join('')}
        </tr>
      `).join('');
    }

    window.showToast(`Executed query in ${json.executionTimeMs} ms using indexes`, 'success');

  } catch (err) {
    console.error('SQL query execution error:', err);
    window.showToast('Network error executing SQL query', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btnRun = document.getElementById('btnRunSqlQuery');
  if (btnRun) {
    btnRun.addEventListener('click', executeCurrentSqlQuery);
  }

  // Load schema file initially
  loadSchemaDdl();
});

window.setQueryTemplate = setQueryTemplate;
window.loadSchemaDdl = loadSchemaDdl;
window.executeCurrentSqlQuery = executeCurrentSqlQuery;
