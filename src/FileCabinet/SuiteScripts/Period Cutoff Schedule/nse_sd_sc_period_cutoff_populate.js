/**
 * @NApiVersion 2.0
 * @NModuleScope Public
 * @NScriptType ScheduledScript
 *
 * @author Selcuk Dogru
 * _nse_sc_period_cutoff_populate
 *
 * @description Creates Period Cutoff Schedule record for open Base Accounting Periods and notifies via e-mail.
 */
define(['N/record', 'N/search', 'N/format', 'N/email'],
function (record, search, format, email) {
  const CUTOFF_TIMES = {
    pHour: 20,
    pMin: 0,
    icHour: 16,
    icMin: 0,
    hcHour: 14,
    hcMin: 0
  };
  const FROM_EMAIL = -5;
  const EMAIL_ROLES = [3];

  function execute(context) {
    var notificationRequired = false;
    var openAccountingPeriods = getOpenPeriods();

    for (ap in openAccountingPeriods) {
      if (!cutOffRecordExists(openAccountingPeriods[ap])) {
        var recId = createCutOffRecord(openAccountingPeriods[ap]);
        if (recId != 0 && !notificationRequired)
          notificationRequired = true;
      }
    }

    if (notificationRequired) {
      sendNotificationEmail();
    }
  }

  /**
   * @function getOpenPeriods
   * @description Searches for base accounting periods which are open
   *
   * @return {array} - Internal IDs of open accounting periods
   */
  function getOpenPeriods() {
    var accountingPeriodSearch = search.create({
      type: search.Type.ACCOUNTING_PERIOD,
      filters: [
        ['closed', 'is', false], 'AND',
        ['isadjust', 'is', false], 'AND',
        ['isinactive', 'is', false], 'AND',
        ['isquarter', 'is', false], 'AND',
        ['isyear', 'is', false]
      ]
    });

    var openPeriods = [];
    accountingPeriodSearch.run().each(function (accountingPeriodSearchResult) {
      openPeriods.push(accountingPeriodSearchResult.id);
      return true;
    });

    return openPeriods;
  }

  /**
   * @function cutOffRecordExists
   * @description Searches for base accounting periods which are open
   *
   * @param {integer} periodId - Internal ID of the base accounting period
   * @param {integer} [currentRecordId] - Internal ID of base accounting period on the current Period Cutoff record being edited
   * @return {boolean}
   */
  function cutOffRecordExists(periodId, currentRecordId) {
    var periodCutOffSearch = search.create({
      type: 'customrecord_nse_period_cutoff_schedule',
      filters: [
        ['custrecord_nse_cutoff_posting_period', 'anyOf', periodId]
      ]
    });

    var periodCutOffSearchResults = periodCutOffSearch.run().getRange({start:0,end:1});
    if (periodCutOffSearchResults.length > 0) {
      return (periodCutOffSearchResults[0].id != currentRecordId);
    }

    return false;
  }

  /**
   * @function createCutOffRecord
   * @description Creates new Period Cutoff Schedule record
   *
   * @param {integer} periodId - Internal ID of the base accounting period
   * @return {integer} - Internal ID of the created record.
   */
  function createCutOffRecord(periodId) {
    var recId = 0;

    var periodRecord = record.load({
      type: record.Type.ACCOUNTING_PERIOD,
      id: periodId
    });

    var periodEndDate = periodRecord.getValue({
      fieldId: 'enddate'
    });

    var periodCutOffTime = getPeriodCutOffTime(periodEndDate);
    var icCutOffTime = getIcCutOffTime(periodEndDate);
    var hardCloseTime = getHardCloseTime(periodEndDate);
    var nextPeriod = getNextPeriod(periodEndDate);

    if (nextPeriod != 0) {
      var cutOffRecord = record.create({
        type: 'customrecord_nse_period_cutoff_schedule',
        isDynamic: true
      });

      cutOffRecord.setValue({
        fieldId: 'custrecord_nse_cutoff_posting_period',
        value: periodId
      });
      cutOffRecord.setValue({
        fieldId: 'custrecord_nse_cutoff_next_period',
        value: nextPeriod
      });
      cutOffRecord.setValue({
        fieldId: 'custrecord_nse_cutoff_period_cut_time',
        value: periodCutOffTime
      });
      cutOffRecord.setValue({
        fieldId: 'custrecord_nse_cutoff_ic_cut_time',
        value: icCutOffTime
      });
      cutOffRecord.setValue({
        fieldId: 'custrecord_nse_cutoff_hard_close_time',
        value: hardCloseTime
      });

      recId = cutOffRecord.save();
    }

    return recId;
  }

  /**
   * @function getPeriodCutOffTime
   * @description Returns the date for the period cutoff
   *
   * @param {date} endDate - Last date of base accounting period
   * @return {datetimetz} - Calculated date for the period cutoff time
   */
  function getPeriodCutOffTime(endDate) {
    var daysOff = 0;

    switch (endDate.getDay()) {
      case 0:
        daysOff = 5;
        break;
      case 1:
        daysOff = 5;
        break;
      case 2:
        daysOff = 5;
        break;
      case 6:
        daysOff = 4;
        break;
      default:
        daysOff = 3;
    }

    if (endDate.getMonth() == 11) {
      daysOff += 7;
    }

    return new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - daysOff, CUTOFF_TIMES.pHour, CUTOFF_TIMES.pMin, 0);
  }

  /**
   * @function getIcCutOffTime
   * @description Returns the date for the IC cutoff
   *
   * @param {date} endDate - Last date of base accounting period
   * @return {datetimetz} - Calculated date for the IC cutoff time
   */
  function getIcCutOffTime(endDate) {
    var daysOff = 0;

    switch (endDate.getDay()) {
      case 0:
        daysOff = 4;
        break;
      case 1:
        daysOff = 4;
        break;
      case 6:
        daysOff = 3;
        break;
      default:
        daysOff = 2;
    }

    return new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - daysOff, CUTOFF_TIMES.icHour, CUTOFF_TIMES.icMin, 0);
  }

  /**
   * @function getHardCloseTime
   * @description Returns the date for the hard close
   *
   * @param {date} endDate - Last date of base accounting period
   * @return {datetimetz} - Calculated date for the hard close time
   */
  function getHardCloseTime(endDate) {
    var daysOn = 0;

    switch (endDate.getDay()) {
      case 0:
        daysOn = 4;
        break;
      case 1:
        daysOn = 4;
        break;
      case 6:
        daysOn = 5;
        break;
      default:
        daysOn = 6;
    }

    return new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + daysOn, CUTOFF_TIMES.hcHour, CUTOFF_TIMES.hcMin, 0);
  }

  /**
   * @function getNextPeriod
   * @description Returns the following base accounting period
   *
   * @param {date} afterDate - Last date of the base accounting period
   * @return {integer} - Internal ID of the next accounting period
   */
  function getNextPeriod(afterDate) {
    var nextPeriodId = 0;
    var periodStartDate = format.format({
      value: new Date(afterDate.getTime()+86400000),
      type: format.Type.DATE
    });

    var accountingPeriodSearch = search.create({
      type: search.Type.ACCOUNTING_PERIOD,
      filters: [
        ['closed', 'is', false], 'AND',
        ['isadjust', 'is', false], 'AND',
        ['isinactive', 'is', false], 'AND',
        ['isquarter', 'is', false], 'AND',
        ['isyear', 'is', false], 'AND',
        ['startdate', 'on', periodStartDate]
      ]
    });

    var nextPeriods = accountingPeriodSearch.run().getRange({
      start:0,
      end:1
    });

    if (nextPeriods.length > 0)
      nextPeriodId = nextPeriods[0].id;
    return nextPeriodId;
  }

  /**
   * @function sendNotificationEmail
   * @description Sends email to defined roles on EMAIL_ROLES
   *
   */
  function sendNotificationEmail() {
    var recipients = [];
    var recipientsSearch = search.create({
      type: search.Type.EMPLOYEE,
      filters: [
        ['role', 'anyOf', EMAIL_ROLES]
      ]
    });

    recipientsSearch.run().each(function (recipient) {
      if (!recipients.includes(recipient.id))
        recipients.push(recipient.id);
      return true;
    });

    var emailBody = 'Greetings from NetSuite,\n\n' +
      'We would like to inform you that new Period Cutoff Record(s) have been created.' +
      'If you are holding FP&A role; please review, make changes if necessary and sign off to verify.\n\n' +
      'In case of any concern, please contact an Administrator.\n\n' +
      'NOTE: If no action taken, system assigned dates will be considered as valid. ' +
      'We urge you to review the data generated to prevent any future automation errors.\n\n' +
      'NetSuite Service Desk';

    email.send({
      author: FROM_EMAIL,
      recipients: recipients,
      subject: 'New Period Cutoff Record(s) Created',
      body: emailBody
    });
  }

  return {
    execute: execute
  };
});
