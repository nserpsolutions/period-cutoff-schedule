/**
 * @NApiVersion 2.0
 * @NScriptType UserEventScript
 * @NModuleScope Public
 *
 * @author Selcuk Dogru
 * _nse_ue_period_cutoff
 *
 * @description Validates the data on the Period Cutoff Schedule record when being created / edited.
 */
define(['N/search', 'N/error', 'N/format'],
function (search, error, format) {
  const MAX_DAYS_FOR_CUTOFF = 10;
  const PERIOD_CUTOFF_RECORD_FIELD_MAP = {
    periodId: 'custrecord_nse_cutoff_posting_period',
    periodCutoffTime: 'custrecord_nse_cutoff_period_cut_time',
    periodEndDate: 'custrecord_nse_cutoff_period_end_date',
    nextPeriod: 'custrecord_nse_cutoff_next_period',
    recordId: 'id'
  };

  function beforeSubmit(scriptContext) {
    if (scriptContext.type == 'create' || scriptContext.type == 'edit' || scriptContext.type == 'xedit') {
      var newRecordJson = getRecordData(scriptContext.newRecord, PERIOD_CUTOFF_RECORD_FIELD_MAP);;

      if (newRecordJson.nextPeriod != getNextPeriod(newRecordJson.periodEndDate)) {
        throw error.create({
          name: 'NSE_ERR_CO_WRONG_NEXT_PERIOD',
          message: 'Selected Posting Period After Cutoff is wrong. Please correct your data and re-submit.',
          notifyOff: true
        });
      }

      if (!isCutoffBetweenAllowedDates(newRecordJson.periodEndDate, newRecordJson.periodCutoffTime)) {
        var errorMessage = 'Period Cutoff Time for selected period is not within range. ' +
          'It must not be later than Period End Date and earlier than ' + MAX_DAYS_FOR_CUTOFF + ' days before the Period End Date';

        throw error.create({
          name: 'NSE_ERR_CO_NOT_IN_RANGE',
          message: errorMessage,
          notifyOff: true
        });
      }

      if (cutOffRecordExists(newRecordJson.periodId, newRecordJson.recordId)) {
        throw error.create({
          name: 'NSE_ERR_CO_REC_EXISTS',
          message: 'Period Cutoff Record for selected period already exists. Please update existing one.',
          notifyOff: true
        });
      }
    }
  }

  /**
   * @function getRecordData
   * @description Gets the field values from a record
   *
   * @param {record.Record} recordObject - NetSuite record that holds the data
   * @param {object} fieldMap - Field mapping for NetSuite field Script IDs
   * @return {object} - Data captured from NetSuite record
   */
  function getRecordData(recordObject, fieldMap) {
    var recordJson = {};
    for (field in fieldMap) {
      recordJson[field] = recordObject.getValue({
        fieldId: fieldMap[field]
      });
    }

    return recordJson;
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
   * @function isCutoffBetweenAllowedDates
   * @description Checks if the period cutoff time falls in allowed range.
   *
   * @param {date} endDate - Last date of the base accounting period
   * @param {datetimetz} cutOffTime - Cutoff time set on the Period Cutoff Schedule record
   * @return {boolean}
   */
  function isCutoffBetweenAllowedDates(endDate, cutoffTime) {
    var earliestCutoffTime = new Date(endDate.getTime() - (endDate.getMonth() == 11 ? ((MAX_DAYS_FOR_CUTOFF+7)*24*60*60*1000) : (MAX_DAYS_FOR_CUTOFF*24*60*60*1000)));

    return (cutoffTime < endDate && cutoffTime > earliestCutoffTime);
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
    })

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

  return {
    beforeSubmit: beforeSubmit
  };
});
