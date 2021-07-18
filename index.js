/*
TODO
・複数URLを実行
・簡単に指定できるように
*/
'use strict';

const fs = require('fs');
const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
//CLI パース用
const cli = require('cac')();
//CLI テーブル表示用
const Table = require('cli-table3');
//CSV作成用
const { convertArrayToCSV } = require('convert-array-to-csv');
const converter = require('convert-array-to-csv');
//console.logをカラフルに
const chalk = require("chalk");
//emoji https://raw.githubusercontent.com/omnidan/node-emoji/master/lib/emoji.json
const emoji = require('node-emoji');

//引数取得 
cli.option('--name <name>', 'folder add name', {
    default: ''
});
const parsed = cli.parse();
//サイトURL
const URL = parsed.args[0];
//実行回数
const COUNT = parsed.args[1] - 1;
//追加するフォルダ名
const ADD_FOLDER_NAME = parsed.options['name'];

//テーブル表示設定
//見出し設定　日本語を設定すると表がずれるので使用しない
const HEAD = [
    'score', 'FCP(ms)', 'LCP(ms)', 'SI(ms)', 'TTI(ms)', 'TBT(ms)', 'CLS', 'ServerResponce'
];
//中身設定
function createCLIDisplay(d) {
    const display = {
        //タイトル:キー名
        //タイトルはHEADを使っているので未使用
        'スコア': d.score,
        'FCP(ms)': d['first-contentful-paint'].numericValue,
        'LCP(ms)': d['largest-contentful-paint'].numericValue,
        'SI(ms)': d['speed-index'].numericValue,
        'TTI(ms)': d['interactive'].numericValue,
        'TBT(ms)': d['total-blocking-time'].numericValue,
        'CLS': d['cumulative-layout-shift'].numericValue,
        'サーバ応答時間(秒)': d['server-response-time'].numericValue,
    }
    return display;
}

//日時 フォルダ名などに使用
const DATE = getDate();
const DATE_STRING = DATE.year + z(DATE.month, 2) + z(DATE.d, 2) + '_' + z(DATE.h, 2) + z(DATE.m, 2) + z(DATE.s, 2);
//ベース名 csvの見出しavgの前に追加
const BASE_NAME = DATE_STRING + ADD_FOLDER_NAME;
//フォルダ名
const FolderName = 'report/' + BASE_NAME;
//CSVファイル名
const CSVFileName = 'report' + BASE_NAME + '.csv';

//実行
main();

/**
 * メイン
 */
async function main() {
    let allData = [];
    let data;
    //
    //レポート毎に保存+集計
    //
    for (let i = 0; i <= COUNT; i++) {
        //レポート取得実行
        data = await getData(i);
        allData.push(data);
    }
    //平均値取得
    const avgData = getAvgData(allData);
    //
    //結果を画面表示
    //
    //テーブル表示用のデータを作成
    console.log();
    console.log(chalk.green.bold('Results:' + BASE_NAME) + emoji.get('memo'));
    const fixCliTableData = getFixCliTableData(allData, avgData);
    displayTable(fixCliTableData);
    //
    //CSV作成して保存
    //
    let csvData = getFixCSVData(allData, avgData);
    //結果をまとめたcsv作成
    const csvFromArrayOfArrays = convertArrayToCSV(csvData, { header: HEAD, separator: ',' });
    //
    fs.writeFileSync(FolderName + '/' + CSVFileName, csvFromArrayOfArrays);
    //
    //csvをコピペできるように表示
    console.log();
    console.log(chalk.green.bold('For copying to a spreadsheet') + emoji.get('memo'));
    let copyCliCSV = csvFromArrayOfArrays.replace(/,/g, '\t');
    console.log(chalk.yellow(copyCliCSV));
}

/**
 * レポート取得・作成処理
 * @param {*} i 
 * @returns data
 */
async function getData(i) {
    //表示回数
    const displayCount = i + 1;
    const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
    //パフォーマンスだけを取得
    //const options = { logLevel: 'info', output: 'html', onlyCategories: ['performance'], port: chrome.port };
    const options = { output: 'html', onlyCategories: ['performance'], port: chrome.port };
    const runnerResult = await lighthouse(URL, options);
    //レポートデータ
    const reportHtml = runnerResult.report;
    //レポートファイル名
    const FileName = FolderName + '/' + DATE_STRING + '_' + displayCount + '.html';
    //フォルダがなければ作成
    await createFolder(FolderName);
    //ファイル作成
    fs.writeFileSync(FileName, reportHtml);
    //各スコア
    let audits = runnerResult.lhr.audits;
    //CLI表示用にデータをまとめる
    let data = audits;
    //スコアを追加
    data.score = runnerResult.lhr.categories.performance.score * 100;

    console.log(chalk.green('Report ' + displayCount + ' Done') + emoji.get('rocket'));
    //主要な指標のみ抽出
    data = createCLIDisplay(data);
    await chrome.kill();
    return Object.values(data);
}

/**
 * dataを集計して平均値を出す
 * @param {*} data 
 * @returns 
 */
function getAvgData(data) {
    let i = data.length;
    let sumData = [];
    for (let j = 0; j < data.length; j++) {
        let row = data[j];
        for (let k = 0; k < row.length; k++) {
            if (!sumData[k]) { sumData[k] = 0; }
            sumData[k] += row[k];
        }
    }
    let avgData = [];
    for (let l = 0; l < sumData.length; l++) {
        let row = sumData[l];
        avgData[l] = sumData[l] / i;
    }
    return avgData;
}

/**
 * CLIで表示するテーブル用のデータを作成する
 * @param {*} allData 
 * @param {*} avgData 
 * @returns 
 */
function getFixCliTableData(allData, avgData) {
    let fixData = [];
    //先頭に回数を追加
    for (let l = 0; l < allData.length; l++) {
        //数字を丸める
        let row = roundRowData(allData[l]);
        let key = (l + 1);
        let rowObject = {};
        rowObject[key] = row;
        fixData.push(rowObject);
    }
    //平均を追加
    let rowAvgObject = {}
    //数字を丸める
    rowAvgObject['avg.'] = roundRowData(avgData);
    fixData.push(rowAvgObject);
    return fixData;
}

/**
 * テーブル表示
 * @param {*} data 
 */
function displayTable(data) {
    //見出し行の先頭に空行を追加する
    let tableHead = HEAD;
    tableHead.unshift("");
    let table = new Table({ head: tableHead, });
    for (let i = 0; i < data.length; i++) {
        table.push(data[i]);
    }
    console.log(table.toString());
}

/**
 * CSVファイルとし保存するデータを作成する
 * @param {*} allData 
 * @param {*} avgData 
 */
function getFixCSVData(allData, avgData) {
    let csvData = [];
    for (let l = 0; l < allData.length; l++) {
        let row = allData[l];
        row = roundRowData(row);
        row.unshift(l + 1);
        csvData.push(row);
    }
    avgData = roundRowData(avgData);
    avgData.unshift(BASE_NAME + '_' + 'avg.');
    //平均値を最後の行に追加
    csvData.push(avgData);
    return csvData;
}

/**
 * フォルダ作成
 * @param {*} FolderName 
 */
async function createFolder(FolderName) {
    if (fs.existsSync(FolderName)) {
    } else {
        //フォルダが存在しないときフォルダ作成
        fs.mkdirSync(FolderName, (err) => {
            if (err) { console.error(err) }
        });
    }
}

/**
 * 日時の取得
 * @returns 
 */
function getDate() {
    const now = new Date();
    var date = {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        d: now.getDate(),
        h: now.getHours(),
        m: now.getMinutes(),
        s: now.getSeconds(),
    };
    return date;
}

/**
 * テーブル表示用に配列を丸める
 * @param {*} data 
 * @returns 
 */
function roundRowData(data) {
    let roundData = [];
    for (let m = 0; m < data.length; m++) {
        roundData[m] = selRound(data[m], 10);
    }
    return roundData;
}

/**
 * 丸める　10=>小数点1桁 100=>小数点2桁
 * @param {*} value 
 * @param {*} base 
 * @returns 
 */
function selRound(value, base) {
    return Math.round(value * base) / base;
}

/**
 * 0埋め
 * @param {*} num 
 * @param {*} length 
 * @returns 
 */
function z(num, length) {
    return ('0000' + num).slice(-length);
}

