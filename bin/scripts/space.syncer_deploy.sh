#!/bin/bash
. ~/.bash_profile

PACKAGE='space.syncer.zip'
SPACE_SYNCER_HOME='/home/gkathan/space.syncer'

# first check whether we have a deploy package..
if [ -a $PACKAGE ]; then
	rm -Rf $SPACE_SYNCER_HOME/app_rollback_old

	if  [ -d $SPACE_SYNCER_HOME/app_rollback ]; then
		mv $SPACE_SYNCER_HOME/app_rollback $SPACE_SYNCER_HOME/app_rollback_old
	fi

	echo '[s p a c e.syncer - deploy] says: parking old version in "space_rollback" folder...'
	mv  $SPACE_SYNCER_HOME/app $SPACE_SYNCER_HOME/app_rollback
	echo "[s p a c e.syncer - deploy] says: going to unpack and deploy from: $PACKAGE"
	mkdir $SPACE_SYNCER_HOME/app -p


	mv $PACKAGE $SPACE_SYNCER_HOME/app/

	cd $SPACE_SYNCER_HOME/app
	unzip ./$PACKAGE

	mkdir $SPACE_SYNCER_HOME/app/logs -p



else
	echo "[s p a c e.syncer - deploy] says: SORRY but there is NO $PACKAGE around .... "
fi
