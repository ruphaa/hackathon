//libraries and packages required

require('dotenv').config();
var express = require('express');
var app = express();
var request = require('request');
const bodyParser = require('body-parser');
var RtmClient = require('@slack/client').RtmClient;
var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
var RTM_EVENTS = require('@slack/client').RTM_EVENTS;
var apiai = require("apiai");
var apiapp = apiai(process.env.API_AI_TOKEN);
var databaseQuery = require("./database");
var mongoose = require('mongoose');
var constants = require("./constants");
var unirest = require('unirest');
var fd = require('node-freshdesk-api');


//mongoDB connection
mongoose.connect(constants.MONGODB_URL,function(){
    console.log('Connection is established');
});

//freshdesk integration

var enocoding_method = "base64";
var auth = "Basic " + new Buffer(process.env.FRESHDESK_API_KEY + ":" + 'X').toString(enocoding_method);
var URL =  "https://" + constants.FRESHDESK_ENDPOINT + ".freshdesk.com"+ constants.FD_TICKET_PATH;

//Connecting to the bot using access accessToken
var rtm = new RtmClient(process.env.BOT_ACCESS_TOKEN);

//starts the rtm
rtm.start();

//declaration of variables required
let channel;
let bot;
let employeeNum;
let employeeReason;
let source;
let destination;
let dateRequested;
let dateOfRequest;
let cabService;
let cabRequestTime;
let empName;
let buHead;
let projectName;
let ticketDetails = {
  empNum : "",
  service : "",
  source : "",
  destination : "",
  dateRequested : "",
  dateOfRequest : "",
  reason : "",
  empName : "",
  buHead : "",
  projectName : ""
}
var cabObject = {};


var updateTicketDetails = function(employeeNum,employeeReason,source,destination,cabService,dateOfRequest,dateRequested,cabRequestTime,empName,buHead,projectName){
  ticketDetails.empNum = employeeNum;
  ticketDetails.reason = employeeReason;
  ticketDetails.source = source;
  ticketDetails.destination = destination;
  ticketDetails.service = cabService;
  ticketDetails.dateOfRequest = dateOfRequest;
  ticketDetails.dateRequested = dateRequested;
  ticketDetails.empName = empName;
  ticketDetails.buHead = buHead;
  ticketDetails.projectName = projectName;

  if(ticketDetails.service == constants.LATE_NIGHT){
    ticketDetails.cabRequestTime = cabRequestTime;
  }
};


rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
  for (const c of rtmStartData.channels) {
      if (c.is_member && c.name === constants.CHANNEL_NAME) { channel = c.id }
  }
  console.log(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}`);
  bot = '<@' + rtmStartData.self.id + '>';
});


rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
  rtm.sendMessage(constants.GREETING, channel);
});


rtm.on(RTM_EVENTS.MESSAGE, function(message) {


  if (message.channel === channel) {
    if (message.text !== null) {
      var customText = message.text;
      let apiai = apiapp.textRequest(customText, {
        sessionId: constants.API_AI_SESSION_ID// any arbitrary id
      });

      apiai.on('response', (response) => {
          if(response.result.metadata.intentName == constants.INTENT_REFUND_REQUEST){
          employeeNum = response.result.contexts[0].parameters.empId;
            /**
             * Emp Id check from database
             * Only if employee id exists in the employee database, request for cab will be sent.
             */
          databaseQuery.checkIfEmployeeIdValid(employeeNum)
          .then(function(isFound){

            if(isFound===true){
              rtm.sendMessage(constants.MESSAGE_FOR_VALID_EMPLOYEE,channel);
            }
            else{
              rtm.sendMessage(constants.MESSAGE_FOR_INVALID_EMPLOYEE, channel);
            }
          }).catch(function(){
            console.log(constants.ERROR_MESSAGE);
          });
        }

        if(response.result.metadata.intentName == constants.INTENT_ADHOC){
          employeeReason = response.result.parameters.reason;
        }

        if(response.result.metadata.intentName == constants.INTENT_ADHOC_LOCATION){
          source = response.result.parameters.source;
          destination = response.result.parameters.destination;
          cabService = constants.SERVICE_ADHOC;
          dateOfRequest = new Date().getFullYear()+"-"+new Date().getMonth()+"-"+new Date().getDate();
          dateRequested = new Date().getFullYear()+"-"+new Date().getMonth()+"-"+new Date().getDate();
          databaseQuery.retrieveProjectDetailsForEmployee(employeeNum)
          .then(function(projectDetails){

            updateTicketDetails(employeeNum,employeeReason,source,destination,cabService,dateOfRequest,dateRequested,cabRequestTime,projectDetails.empName,projectDetails.buHead,projectDetails.projectName);

          }).catch(function(){
            console.log(constants.ERROR_MESSAGE);
          });
        }
        if(response.result.metadata.intentName == constants.INTENT_LATE_NIGHT_TIMING){
          cabRequestTime = response.result.parameters.lateNightCabTimings;
        }

        /**
         * Late night cab request from office to home by taking default addresses from employee database
         */
        if(response.result.metadata.intentName == constants.INTENT_LATE_NIGHT_DATE){
          databaseQuery.retrieveAddressOfTheEmployee(employeeNum)
          .then(function(address){

            source = address.office;
            destination = address.empHome;
            cabService = constants.SERVICE_LATE_NIGHT;
            employeeReason = constants.LATE_SHIFT;
            dateOfRequest = new Date().getFullYear()+"-"+new Date().getMonth()+"-"+new Date().getDate();
            dateRequested = response.result.parameters.date;
            updateTicketDetails(employeeNum,employeeReason,source,destination,cabService,dateOfRequest,dateRequested,cabRequestTime,address.empName,address.buHead,address.projectName);

          }).catch(function(){
            console.log(constants.ERROR_MESSAGE);
          });

        }
        var messageResponse = response.result.fulfillment.speech;
        rtm.sendMessage(messageResponse, channel);
      });

      apiai.on('error', (error) => {
        console.log(error);
      });

      apiai.end();

      /**
       * Ticket confirmation - final step
       * If yes, Ticket will  be raised.
       */
      if(message.text == constants.RESPONSE_YES){
        var fields = {
          'email': constants.TICKET_EMAIL,
          'subject': constants.TICKET_SUBJECT ,
          'description': constants.TICKET_DESCRIPTION,
          'status': constants.TICKET_STATUS,
          'priority': constants.TICKET_PRIORITY,
          'custom_fields[cf_employeeid]':ticketDetails.empNum,
          'custom_fields[cf_date_requested]':ticketDetails.dateRequested,
          'custom_fields[cf_date_of_request]':ticketDetails.dateOfRequest,
          'custom_fields[cf_source]':ticketDetails.source,
          'custom_fields[cf_destination]':ticketDetails.destination,
          'custom_fields[cf_reason_for_service]':ticketDetails.reason,
          'custom_fields[cf_service]':ticketDetails.service,
          'custom_fields[cf_project_details]':ticketDetails.projectName,
          'custom_fields[cf_bu_head]':ticketDetails.buHead,
          'custom_fields[cf_employee_name]':ticketDetails.empName
        };

        var headers = {
          'Authorization': auth
        };
        console.log(fields);
        unirest.post(URL)
          .headers(headers)
          .field(fields)
          .end(function(response){

            if(response.status == 201){
              console.log("Location Header : "+ response.headers['location'])
            }
            else{
              console.log("X-Request-Id :" + response.headers['x-request-id']);
            }
          });
      }

      if(message.text == constants.RESPONSE_NO){
        rtm.sendMessage(constants.MESSAGE_CANCELLATION, channel);
      }

    }
  }
});
