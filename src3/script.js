/* ── 状態管理（IIFEでカプセル化） ── */
(function () {
  'use strict';

  // ── グローバル変数（要件通り外部からアクセス可能） ──
  var allRows = [];           // 全件データ
  var filteredRows = [];      // フィルター後データ

  // ── 設定 ──
  var PAGE_SIZE = 25;         // 1ページあたりの件数（変更可能）
  var STATUS_OPTS = ['高', '中', '低'];

  // ── localStorageキー ──
  var STORAGE_KEY = 'task_data';

  // -- github --
  const GIT_REMOTE_URI = "http://localhost:3000";
  const PROJECT_NAME = "foo";
  const INITIAL_DATAFILE = "data.json";

  // ── データ保存（localStorage） ──
  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        columns: columns,
        rows: allRows
      }));
    } catch (e) {
      console.warn('データの保存に失敗しました:', e);
    }
  }

  // 平日をカウント: d1 - d2
  function weekdays(d1, d2){
	  // カウント
	  let count = 0;
	  // d1がd2より大きい間，d2+1していく
	  while(d1 >= d2){
		  // d2に+1日
		  today.setDate(d2.getDate() + 1);
		  // 曜日を取得 0=日 6=土
		  let week = d2.getDay();
		  // 祝日を取得（祝日なら祝日名，祝日でなければundefined）
		  let is_holiday = JapaneseHolidays.isHoliday(today);
		  // 土日でも祝日でもないとき
		  if(week != 0 && week != 6 && !is_holiday){
			  ++count;
		  }
	  }
	  return count;
  }

  // ── 編集後のデータをJSONファイルとしてダウンロード ──
  function exportJSON() {
    // 既存のデータとコメントデータを統合してエクスポート
    var exportData = {
      columns: columns,
      rows: allRows,
      comments: JSON.parse(CommentManager.getCommentsAsJSON()) // コメントデータも追加
    };
    var data = JSON.stringify(exportData, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var now = new Date();
    var ts = now.getFullYear()
        + String(now.getMonth() + 1).padStart(2, '0')
        + String(now.getDate()).padStart(2, '0')
        + '-' + String(now.getHours()).padStart(2, '0')
        + String(now.getMinutes()).padStart(2, '0');
    a.href = url;
    a.download = 'data_' + ts + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── 現在ページ ──
  var currentPage = 1;

  // ── ソート状態 ──
  var sortCol = null;   // ソート対象カラムの key
  var sortDir = 0;      // 0=なし, 1=昇順, 2=降順

  // ── グローバル検索 ──
  var globalSearch = '';  // 検索テキスト

  // ── フィールドフィルター ──
  var fieldFilterKey = '';   // 絞り込み対象フィールドの key
  var fieldFilterValue = ''; // 絞り込み値

  // ── DOMハンドル ──
  var theadRow, tbody, fieldFilterSelect, fieldFilterInput, searchInput, pageSizeSelect, pagInfo, pagBtns, emptyMsg;

  // ── 初期化 ──
  function init() {
    theadRow = document.getElementById('js-thead-row');
    tbody = document.getElementById('js-tbody');
    fieldFilterSelect = document.getElementById('js-field-filter');
    fieldFilterInput = document.getElementById('js-field-filter-input');
    searchInput = document.getElementById('js-search-input');
    pageSizeSelect = document.getElementById('js-pagesize-select');
    pagInfo = document.getElementById('js-pag-info');
    pagBtns = document.getElementById('js-pag-btns');
    emptyMsg = document.getElementById('js-empty-msg');

    loadJSON('./data/task.json');

    // CommentManager を初期化
    // コメント対象のルート要素はテーブル全体をラップしている `js-wrap`
    CommentManager.init(document.getElementById('js-wrap'));

    // コメントのダウンロード・アップロードボタンを追加
    addCommentIOButtons();
  }

  // ── JSONファイル取得 ──
  function loadJSON(jsonfile) {
    fetch(jsonfile)
      .then(function (res) {
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        return res.json();
      })
      .then(function (data) {
        // localStorageに保存済みのデータがある場合はそれを優先（編集後のデータが優先）
        var saved = null;
        try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { /* ignore */ }
        if (saved && saved.rows && saved.rows.length > 0) {
          allRows = saved.rows.slice();
          columns = saved.columns;
          // 保存データにコメントが含まれていればロード
          if (saved.comments) {
            CommentManager.loadCommentsFromJSON(JSON.stringify(saved.comments));
          }
        } else {
          allRows = data.rows.slice();
          columns = data.columns;
        }
        filteredRows = allRows.slice();        // 最初は全件
        populateFieldFilter();                   // フィールドフィルター自動生成
        currentPage = 1;                       // ページリセット
        render();                              // 初回描画
      })
      .catch(function (err) {
        console.error('データ読み込みエラー:', err);
        tbody.textContent = '';
        var tr = document.createElement('tr');
        var td = document.createElement('td');
        td.colSpan = '6';
        td.style.cssText = 'text-align:center;color:#9b1c1c;padding:24px;';
        td.textContent = 'データを読み込めませんでした。';
        tr.appendChild(td);
        tbody.appendChild(tr);
      });
  }

  // ── ヘッダー描画 ──
  function renderHeader(cols) {
    columns = cols;  // renderBodyで参照するため保持
    theadRow.innerHTML = '';
    columns.forEach(function (col) {
      var th = document.createElement('th');
      th.textContent = col.label;
      if (col.width) { th.style.width = col.width; }

      // ソートインジケーター表示
      if (sortCol === col.key) {
        var icon = document.createElement('span');
        icon.className = 'tbl-sort-icon';
        icon.textContent = sortDir === 1 ? ' ▲' : sortDir === 2 ? ' ▼' : '';
        th.appendChild(icon);
        th.setAttribute('aria-sort', sortDir === 1 ? 'ascending' : sortDir === 2 ? 'descending' : 'none');
      } else {
        th.setAttribute('aria-sort', 'none');
      }

      // 編集可能または ID 列はソート対象とする
      if (col.editable || col.key === 'id') {
        th.setAttribute('data-sortable', 'true');
        th.setAttribute('data-col-key', col.key);
      }
      if (col.editable) {
        var hint = document.createElement('span');
        hint.className = 'tbl-edit-hint';
        hint.textContent = '✎';  // ✎
        th.appendChild(hint);
      }
      theadRow.appendChild(th);
    });
  }

  // ── フィールドフィルター自動生成 ──
  function populateFieldFilter() {
    if (!fieldFilterSelect) return;

    // フィールド選択セレクトをクリア
    fieldFilterSelect.innerHTML = '<option value="">選択</option>';

    // columns からフィールド名をリスト化（ID列は除外）
    columns.forEach(function (col) {
      if (col.key === 'id') return;
      var option = document.createElement('option');
      option.value = col.key;
      option.textContent = col.label;
      fieldFilterSelect.appendChild(option);
    });

    // フィールド選択変更イベント
    fieldFilterSelect.addEventListener('change', function () {
      fieldFilterKey = this.value;
      fieldFilterValue = '';
      if (fieldFilterInput) { fieldFilterInput.value = ''; }
      sortCol = null;
      sortDir = 0;
      currentPage = 1;
      applyFilters();
      render();
    });

    // テキスト入力イベント
    if (fieldFilterInput) {
      fieldFilterInput.addEventListener('input', function () {
        fieldFilterValue = this.value;
        currentPage = 1;
        applyFilters();
        render();
      });
    }
  }

  // ── 基本フィルター適用（フィールド＋検索のAND条件） ──
  function applyFilters() {
    var query = globalSearch.toLowerCase();

    filteredRows = allRows.filter(function (row) {
      // フィールドフィルター
      if (fieldFilterKey !== '' && fieldFilterValue !== '') {
        var val = String(row[fieldFilterKey] != null ? row[fieldFilterKey] : '');
        if (val.toLowerCase().indexOf(fieldFilterValue.toLowerCase()) === -1) {
          return false;
        }
      }
      // 検索フィルター
      if (query !== '') {
        var matched = false;
        for (var i = 0; i < columns.length; i++) {
          var val = String(row[columns[i].key] != null ? row[columns[i].key] : '');
          if (val.toLowerCase().indexOf(query) !== -1) {
            matched = true;
            break;
          }
        }
        if (!matched) { return false; }
      }
      return true;
    });
  }

  // ── ソート適用 ──
  function applySort() {
    if (sortCol === null || sortDir === 0) {
      return;  // ソートなしはフィルター結果をそのまま維持
    }

    var col = null;
    for (var i = 0; i < columns.length; i++) {
      if (columns[i].key === sortCol) { col = columns[i]; break; }
    }
    if (!col) { return; }

    // コピーしてからソート（元の配列を不変に保つ）
    filteredRows = filteredRows.slice().sort(function (a, b) {
      var va = a[sortCol];
      var vb = b[sortCol];
      if (va == null) { return 1; }
      if (vb == null) { return -1; }

      var cmp;
      // id 列は数値比較、他は文字列比較（日本語対応）
      if (sortCol === 'id') {
        cmp = Number(va) - Number(vb);
      } else {
        cmp = String(va).localeCompare(String(vb), 'ja');
      }
      return sortDir === 2 ? -cmp : cmp;  // 降順なら反転
    });
  }

  // ── 本体描画（ソート適用→ヘッダ更新→ページネーション含む） ──
  function render() {
    applySort();      // ソート状態を適用
    renderHeader(columns);  // ソートインジケーター再描画
    renderBody();
    renderPagination();
    renderInfo();
  }

  // ──  tbody 描画（現在ページの行のみ） ──
  function renderBody() {
    tbody.innerHTML = '';
    var start = (currentPage - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, filteredRows.length);

    if (filteredRows.length === 0) {
      emptyMsg.hidden = false;
      return;
    }

    emptyMsg.hidden = true;

    for (var i = start; i < end; i++) {
      var row = filteredRows[i];
      var tr = document.createElement('tr');
      // var globalIdx = i;  // filteredRows内のインデックス
      columns.forEach(function (col) {
        var td = document.createElement('td');
        if (col.editable) {
          td.className = 'tbl-cell-editable';
          td.setAttribute('title', 'クリックして編集');
          td.setAttribute('data-idx', i); // filteredRows内のインデックス
          td.setAttribute('data-col', col.key);
        } else {
          td.className = 'tbl-cell-readonly';
        }
        // コメント管理用に data-comment-id を付与
        // row.id はユニークな行IDを想定 (JSONデータにidフィールドがあることを前提)
        var commentId = 'table-cell-' + row.id + '-' + col.key;
        td.setAttribute('data-comment-id', commentId);

        // コメントが存在すれば data-has-comment 属性を付与
        if (CommentManager.getComment(commentId)) {
          td.setAttribute('data-has-comment', 'true');
        }

        renderCell(td, row, col);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
  }

  // ── セル内容描画（編集モード除く） ──
  function renderCell(td, row, col) {
    td.textContent = '';
    var val = row[col.key];
    if (col.key === 'status') {
      var span = document.createElement('span');
      span.className = 'tbl-status';
      span.setAttribute('data-status', val != null ? val : '');
      span.textContent = val != null ? val : '';
      td.appendChild(span);
    } else {
      td.textContent = val != null ? val : '';
    }
  }

  // ── ページネーションボタン描画 ──
  function renderPagination() {
    pagBtns.innerHTML = '';
    var totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
    if (totalPages <= 1) { return; }  // ボタン不要

    var prevBtn = document.createElement('button');
    prevBtn.className = 'pag-btn';
    prevBtn.textContent = '◀';  // ◀
    prevBtn.disabled = currentPage <= 1;
    prevBtn.addEventListener('click', function () {
      if (currentPage > 1) { currentPage--; render(); }
    });
    pagBtns.appendChild(prevBtn);

    // ページ番号ボタン（最大7個表示、端っこは省略記号）
    var pages = getPageNumbers(currentPage, totalPages);
    pages.forEach(function (p) {
      if (p === '...') {
        var span = document.createElement('span');
        span.className = 'pag-btn';
        span.setAttribute('disabled', '');
        span.setAttribute('aria-hidden', 'true');
        span.textContent = '…';  // …
        pagBtns.appendChild(span);
      } else {
        var btn = document.createElement('button');
        btn.className = 'pag-btn';
        btn.textContent = p;
        btn.setAttribute('data-page', p);
        if (p === currentPage) { btn.setAttribute('aria-current', 'page'); }
        btn.addEventListener('click', function () {
          currentPage = parseInt(this.getAttribute('data-page'), 10);
          render();
        });
        pagBtns.appendChild(btn);
      }
    });

    // 次へボタン
    var nextBtn = document.createElement('button');
    nextBtn.className = 'pag-btn';
    nextBtn.textContent = '▶';  // ▶
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.addEventListener('click', function () {
      if (currentPage < totalPages) { currentPage++; render(); }
    });
    pagBtns.appendChild(nextBtn);
  }

  // 表示すべきページ番号を配列で返す（端っこ省略処理）
  function getPageNumbers(current, total) {
    if (total <= 7) {
      var arr = [];
      for (var i = 1; i <= total; i++) { arr.push(i); }
      return arr;
    }

    var pages = [];
    if (current <= 4) {
      for (var i = 1; i <= 5; i++) { pages.push(i); }
      pages.push('...');
      pages.push(total);
    } else if (current >= total - 2) {
      pages.push(1);
      pages.push('...');
      for (var i = total - 4; i <= total; i++) { pages.push(i); }
    } else {
      pages.push(1);
      pages.push('...');
      for (var i = current - 1; i <= current + 1; i++) { pages.push(i); }
      pages.push('...');
      pages.push(total);
    }
    return pages;
  }

  // ── ページ情報表示 ──
  function renderInfo() {
    var total = filteredRows.length;
    var totalPages = Math.ceil(total / PAGE_SIZE);
    var start = (currentPage - 1) * PAGE_SIZE + 1;
    var end = Math.min(start + PAGE_SIZE - 1, total);
    var text = '全' + total + '件中 ' + start + '〜' + end + '件表示';
    if (totalPages > 1) { text += ' （' + totalPages + 'ページ）'; }
    pagInfo.textContent = text;
  }

  // ── 列定義（JSONから取得するが、renderBody内で参照するため関数外に出す） ──
  var columns = [];

  // ── イベント委任: テーブルのセル操作 ──
  function bindEvents() {
    var wrap = document.getElementById('js-wrap');

    // グローバル検索テキストボックス — input イベントでリアルタイム絞り込み
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        globalSearch = this.value;
        currentPage = 1;
        applyFilters();
        render();
      });
    }

    // ページ件数ドロップ — 変更でPAGE_SIZEを更新
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', function () {
        PAGE_SIZE = parseInt(this.value, 10);
        currentPage = 1;
        render();
      });
    }
    theadRow.addEventListener('click', function (e) {
      var th = e.target.closest('th[data-sortable]');
      if (!th) { return; }

      var colKey = th.getAttribute('data-col-key');
      if (!colKey) { return; }

      // 同じカラム: 昇順(1) → 降順(2) → なし(0) のサイクル
      // 別カラム: 昇順(1) から再開
      if (sortCol === colKey) {
        sortDir = sortDir === 1 ? 2 : sortDir === 2 ? 0 : 1;
        if (sortDir === 0) { sortCol = null; }
      } else {
        sortCol = colKey;
        sortDir = 1;
      }

      currentPage = 1;  // ソート時は1ページ目にリセット
      render();
    });

    // JSONエクスポートボタン
    var exportBtn = document.getElementById('js-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        exportJSON();
      });
    }

    // セルクリック → インライン編集
    wrap.addEventListener('click', function (e) {
      var td = e.target.closest('td.tbl-cell-editable');
      if (!td || td.classList.contains('is-editing')) { return; }

      var idx = parseInt(td.getAttribute('data-idx'), 10);
      var colKey = td.getAttribute('data-col');
      var col = null;
      for (var i = 0; i < columns.length; i++) {
        if (columns[i].key === colKey) { col = columns[i]; break; }
      }
      if (!col) { return; }

      startEdit(td, filteredRows[idx], col);
    });

    // セルダブルクリック → github
    wrap.addEventListener('dblclick', function (e) {
      // githubとは関係ないセルでも開こうとするけれど，構わないことにする
      var td = e.target.closest('td.tbl-cell-editable');
      if (!td) { return; }

      var idx = parseInt(td.getAttribute('data-idx'), 10);
      var colKey = td.getAttribute('data-col');
      var col = null;
      for (var i = 0; i < columns.length; i++) {
        if (columns[i].key === colKey) { col = columns[i]; break; }
      }
      if (!col) { return; }
      openGithub(td, filteredRows[idx], col);
    });
  }

  // githubのページを開く（とりあえずissueのみ）
  function openGithub(td, row, col) {
    var category = col.key;
    if (category === 'issues') {
      var issue = row[category];
      if (!issue) {
        return;
      }
      else if (issue[0] == "#") {
        issue = issue.substring(1);
      }
      if(issue != ""){
        var uri = GIT_REMOTE_URI + "/" + PROJECT_NAME + "/issues/" + issue;
        window.open(uri, '_blank');
      }
    }
  }

  // ── インライン編集開始 ──
  function startEdit(td, row, col) {
    if (td.classList.contains('is-editing')) { return; }
    td.classList.add('is-editing');
    td.textContent = '';

    var savedVal = String(row[col.key] != null ? row[col.key] : '');
    var input;

    if (col.type === 'select') {
      input = document.createElement('select');
      input.className = 'tbl-select';
      STATUS_OPTS.forEach(function (opt) {
        var option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (opt === savedVal) { option.selected = true; }
        input.appendChild(option);
      });
    }
    else if (col.type === 'cal') {
      savedVal = savedVal.replace(/\//g, "-");
      input = document.createElement('input');
      input.type = 'date';
      input.className = 'tbl-input';
      input.value = savedVal;
    }
    else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'tbl-input';
      input.value = savedVal;
    }

    td.appendChild(input);
    input.focus();
    if (input.tagName === 'INPUT') { input.select(); }

    var committed = false;

    function confirmEdit() {
      if (committed) { return; }
      committed = true;
      if (col.type === 'cal') {
        row[col.key] = input.value.replace(/[^0-9]/g, '/');
      }
      else {
        row[col.key] = input.value;
      }
      saveData();  // 編集後にlocalStorageへ自動保存
      td.classList.remove('is-editing');
      renderCell(td, row, col);
    }

    function cancelEdit() {
      if (committed) { return; }
      committed = true;
      td.classList.remove('is-editing');
      renderCell(td, row, col);
    }

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        confirmEdit();
      } else if (e.key === 'Escape') {
        cancelEdit();
      }
    });

    // フォーカスが外れたら確定
    input.addEventListener('blur', confirmEdit);
  }

  // コメントのダウンロード・アップロードボタンを追加する関数
  function addCommentIOButtons() {
    const filterBar = document.getElementById('js-filter-bar');
    if (!filterBar) return;

    // コメントエクスポートボタン
    const exportCommentsBtn = document.createElement('button');
    exportCommentsBtn.className = 'filter-export';
    exportCommentsBtn.id = 'js-export-comments-btn';
    exportCommentsBtn.textContent = '📥 コメントエクスポート';
    exportCommentsBtn.title = 'コメントデータをJSONファイルとしてダウンロード';
    exportCommentsBtn.addEventListener('click', () => {
      const commentData = CommentManager.getCommentsAsJSON();
      const blob = new Blob([commentData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const ts = now.getFullYear()
        + String(now.getMonth() + 1).padStart(2, '0')
        + String(now.getDate()).padStart(2, '0')
        + '-' + String(now.getHours()).padStart(2, '0')
        + String(now.getMinutes()).padStart(2, '0');
      a.href = url;
      a.download = 'comments_' + ts + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    filterBar.appendChild(exportCommentsBtn);

    // コメントインポートボタン
    const importCommentsBtn = document.createElement('button');
    importCommentsBtn.className = 'filter-export';
    importCommentsBtn.id = 'js-import-comments-btn';
    importCommentsBtn.textContent = '⬆ コメントインポート';
    importCommentsBtn.title = 'コメントデータをJSONファイルから読み込む';
    importCommentsBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const jsonString = event.target.result;
              CommentManager.loadCommentsFromJSON(jsonString);
              // コメントがロードされたら、テーブルを再描画してdata-has-comment属性を反映させる
              render();
            } catch (error) {
              console.error('コメントJSONファイルの読み込みエラー:', error);
              alert('コメントJSONファイルの読み込みに失敗しました。');
            }
          };
          reader.readAsText(file);
        }
      };
      input.click();
    });
    filterBar.appendChild(importCommentsBtn);
  }


  // ── 初期化実行 ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init();
      bindEvents();
      // CommentManager は init() で初期化される
    });
  } else {
    init();
    bindEvents();
    // CommentManager は init() で初期化される
  }

})();
