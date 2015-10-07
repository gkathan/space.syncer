#!/bin/bash

#Find the Process ID for www running instance
echo "....killng running s p a c e.syncer  instance"
PID1=`ps -eaf | grep 'forever ./spacesyncer.js' | grep -v grep | awk '{print $2}'`
if [[ "" !=  "$PID1" ]]; then
  echo "[s p a c e.syncer]killing: forever ./spacesyncer: PID =  $PID1"
  kill -9 $PID1
fi

PID2=`ps -eaf | grep 'space.syncer/app/spacesyncer' | grep -v grep | awk '{print $2}'`
if [[ "" !=  "$PID2" ]]; then
  echo "[s p a c e ] killing space.syncer PID = $PID2"
  kill -9 $PID2
fi
. ~/.bash_profile
#nohup npm start > /dev/null 2>&1 &kill
cd ~/space.syncer/app
echo "[s p a c e.syncer] init:  run-script startPROD ..."
nohup npm run-script startPROD > /dev/null 2>&1 &
sleep 1
echo "[s p a c e.syncer] starting .."
sleep 1
echo "[s p a c e.syncer] starting ..."
sleep 1
echo "[s p a c e.syncer] starting ...."
sleep 1
echo "[s p a c e.syncer] starting ....."
sleep 1
echo "[s p a c e.syncer] starting ......"

PIDNEW=`ps -eaf | grep 'space.syncer/app/spacesyncer.js' | grep -v grep | awk '{print $2}'`
echo "[s p a c e.syncer] new instance RUNNING PID = $PIDNEW"
