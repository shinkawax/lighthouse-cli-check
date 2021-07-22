/*
TODO
・複数URLを実行
・簡単に指定できるように
・組み込みで使えるようにする
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
cli.option('--name <name>', 'project name', {
    default: ''
});
const parsed = cli.parse();
//サイトURL
const URL = parsed.args[0];
//実行回数
const COUNT = parsed.args[1] - 1;
//追加するフォルダ名
const INPUT_PROJECT_NAME = parsed.options['name'];

//テーブル表示設定
const DEFAULT_AUD = {
    SCORE: 'score',
    FCP: 'first-contentful-paint.numericValue',
    LCP: 'largest-contentful-paint.numericValue',
    SI: 'speed-index.numericValue',
    TTI: 'interactive.numericValue',
    TBT: 'total-blocking-time.numericValue',
    CLS: 'cumulative-layout-shift.numericValue',
    response: 'server-response-time.numericValue',
};

/**
 * 見出しを取得する
 * @returns []
 */
function getHEAD() {
    return Object.keys(DEFAULT_AUD);
}
/**
 * 中身を取得
 */
function getValues() {
    return Object.values(DEFAULT_AUD);
}

//日時 フォルダ名などに使用
const DATE = getDate();
const DATE_STRING = DATE.year + z(DATE.month, 2) + z(DATE.d, 2) + '_' + z(DATE.h, 2) + z(DATE.m, 2) + z(DATE.s, 2);
//プロジェクト名　指定がなければ日付のみ
//cliのテーブル・csvのavgの前に出る文字列
let projectNameStr;
if (!INPUT_PROJECT_NAME) {
    projectNameStr = DATE_STRING;
} else {
    projectNameStr = INPUT_PROJECT_NAME;
}
const PROJECT_NAME = projectNameStr;
//ファイルのベース名
const FILE_BASE_NAME = DATE_STRING + '_' + INPUT_PROJECT_NAME;
//フォルダ名
const FolderName = 'report/' + FILE_BASE_NAME;
//CSVファイル名
const CSVFileName = 'report' + FILE_BASE_NAME + '.csv';
//リトライ回数
const RETRY_COUNT = 3;

//実行
main();

/**
 * メイン
 */
async function main() {
    //フォルダを作成する
    await createFolder('report');
    await createFolder(FolderName);
    //
    //レポート毎に保存+集計
    //
    let allData = [];
    try {
        for (let i = 0; i <= COUNT; i++) {
            let data = [];
            let errorCount = 0;
            while (data[0] == undefined || data[0] <= 0) {
                //表示回数
                let displayCount = i + 1;
                //レポート取得実行
                log(chalk.green('Report:' + displayCount + ' start'));
                //スコアが0点以上になるまで実行
                let result = await runLighthouseWithChrome();
                log(chalk.green('Report:' + displayCount + ' get result'));

                //スコア情報整理
                data = await getData(result);
                if (data[0] > 0) {
                    log(chalk.green.bold('Report:' + displayCount + ' score:' + data[0]));
                    //HTML作成
                    await createHTMLReport(i, result.report);
                    log(chalk.green('Report:' + displayCount + ' create HTML report'));
                } else {
                    log(chalk.red.bold('Report:' + displayCount + ' ERROR RETRY'));
                    errorCount += 1;
                    if (errorCount == (RETRY_COUNT)) {
                        throw 'RETRY_ERROR';
                    }
                }
            }
            allData.push(data);
        }
    } catch (e) {
        log(chalk.red.bold('RETRY COUNT ERROR'));
        return;
    }
    //平均値取得
    const avgData = getAvgData(allData);
    //
    //結果を画面表示
    //
    //テーブル表示用のデータを作成
    console.log();
    console.log(chalk.green.bold('Results:' + PROJECT_NAME));
    const fixCliTableData = getFixCliTableData(allData, avgData);
    displayTable(fixCliTableData);
    //
    //CSV作成して保存
    //
    let csvData = getFixCSVData(allData, avgData);
    //結果をまとめたcsv作成
    const csvFromArrayOfArrays = convertArrayToCSV(csvData, { header: getHEAD(), separator: ',' });
    //
    fs.writeFileSync(FolderName + '/' + CSVFileName, csvFromArrayOfArrays);
    //
    //csvをコピペできるように表示
    console.log();
    console.log(chalk.green.bold('For copying to a spreadsheet'));
    let copyCliCSV = csvFromArrayOfArrays.replace(/,/g, '\t');
    console.log(chalk.yellow(copyCliCSV));
}

/**
 * lighthouse結果取得
 * @param {*} i 
 * @returns data
 */
async function runLighthouseWithChrome() {
    const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
    //パフォーマンスだけを取得
    //const options = { logLevel: 'info', output: 'html', onlyCategories: ['performance'], port: chrome.port };
    const options = { output: 'html', onlyCategories: ['performance'], port: chrome.port };
    const result = await lighthouse(URL, options);
    await chrome.kill();
    return result;
}

/**
 * HTMLレポート作成
 * @param {*} i 
 * @param {*} report 
 */
async function createHTMLReport(i, report) {
    //表示回数
    const displayCount = i + 1;
    //レポートファイル名
    const FileName = FolderName + '/' + DATE_STRING + '_' + displayCount + '.html';
    //ファイル作成
    fs.writeFileSync(FileName, report);
}

/**
 * lighthouseのデータを元にスコアと主要なデータのみの配列を返す
 * @param {*} result 
 * @returns 
 */
async function getData(result) {
    let audits = result.lhr.audits;
    //CLI表示用にデータをまとめる
    let d = audits;
    //スコアを追加
    const score = result.lhr.categories.performance.score * 100;
    //集める配列
    let data = [];
    //取得するべきaud
    const aud = getValues();
    for (let i = 0; i < aud.length; i++) {
        if (aud[i] == 'score') {
            const score = result.lhr.categories.performance.score * 100;
            data.push(score);
        } else {
            const audSplit = aud[i].split('.');
            const audName = audSplit[0];
            const audPropatyName = audSplit[1];
            const audBase = d[audName];
            const audPropaty = audBase[audPropatyName];
            data.push(audPropaty);
        }
    }
    return data;
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
    let tableHead = getHEAD();
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
    avgData.unshift(PROJECT_NAME + '_' + 'avg.');
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
        roundData[m] = selRound(data[m], 100);
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

/**
 * 日時付きログ出力
 * @param {*} str 
 */
function log(str) {
    const logdate = getDate();
    const logdateString = logdate.year + '/' + z(logdate.month, 2) + '/' + z(logdate.d, 2) + ' '
        + z(logdate.h, 2) + ':' + z(logdate.m, 2) + ':' + z(logdate.s, 2);
    console.log(logdateString + ' ' + str);
}
