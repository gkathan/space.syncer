#!/bin/bash
echo '[s p a c e.syncer - deploy] says: rolling back old version'
mv space.syncer/app space/app_rollforward
mv space.syncer/app_rollback space/app
