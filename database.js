  var express = require('express');
  var mongoose =  require('mongoose');
  var databaseQuery = (function(){
    var employeeSchema = mongoose.Schema({
      EmpID : String,
      Name : String,
      Address : String,
      ProjectName : String,
      Office : String,
      PhNo : String,
      BUHead : String
    });
    var Cabcollection = mongoose.model("cabcollection",employeeSchema,"cabcollection");

    var checkIfEmployeeIdValid = function(empNum){

      return new Promise(function(resolve,reject){
        var isFound = false;

          Cabcollection.find({EmpID : empNum},function(err,result){
          if(err) console.log('Oops !');
          else {
            if(result.length>=1){
              isFound = true;
              console.log(isFound);
            }

          }
          resolve(isFound);
        });
      });
    };

    var retrieveAddressOfTheEmployee = function(empNum){

      return new Promise(function(resolve,reject){
        var address ={
          empHome : "",
          office : "",
          empName : "",
          buHead : "",
          projectName : ""
        };


        Cabcollection.find({EmpID : empNum},function(err,result){
          if(err) console.log('Oops !');
          else{
            address.empHome = result[0].Address;
            address.office = result[0].Office;
            address.empName = result[0].Name;
            address.buHead = result[0].BUHead;
            address.projectName = result[0].ProjectName;

          }
          resolve(address);
        });
      });
    };

    var retrieveProjectDetailsForEmployee = function(empNum){

      return new Promise(function(resolve,reject){
        var projectDetails = {
          empName : "",
          buHead : "",
          projectName : ""
        };
        Cabcollection.find({EmpID : empNum},function(err,result){
          if(err) console.log('Oops !');
          else{
            projectDetails.empName = result[0].Name;
            projectDetails.buHead = result[0].BUHead;
            projectDetails.projectName = result[0].ProjectName;

          }
          resolve(projectDetails);
        });
      });
    };

    return {
      checkIfEmployeeIdValid : checkIfEmployeeIdValid,
      retrieveAddressOfTheEmployee : retrieveAddressOfTheEmployee,
      retrieveProjectDetailsForEmployee : retrieveProjectDetailsForEmployee
    }
  })();

  module.exports = databaseQuery;
