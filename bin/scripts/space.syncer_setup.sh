#!/bin/bash
. ~/.bash_profile

PACKAGE='space.syncer_scripts.zip'

# first check whether we have a deploy package..
if [ -a $PACKAGE ]; then
	rm -Rf space.syncer/scripts
	mkdir space.syncer/scripts -p
	mkdir space.syncer/app -p
	unzip -u ./space.syncer_scripts.zip -d space.syncer/scripts/
	chmod 755 ./space.syncer/scripts/*.sh
	rm $PACKAGE


else
	echo "[s p a c e.syncer - deploy] says: SORRY but there is NO $PACKAGE around .... "
fi
