#!/bin/bash

clear
cd ./templades
cat banner.txt
cd ../

CONFIG_MASTER_PASSWORD="admin"

echo "Do you want to install recommended dependencies? (y,n)"
read answerDemp

if [ "$answerDemp" == "y" ]; then
    echo "Installing dependencies (Node js, Postgresql, Nginx, ffmpeg)"
    curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash -
    apt-get install nodejs -y && apt install postgresql-10 -y && apt install ufw -y && apt install goaccess -y && apt install -y nginx && apt install -y ffmpeg && apt install -y npm
    echo "[OK] Dependencies installed!"
    echo ""

fi

echo "Info: To avoid errors, do not create a password with the special characters: '|'"
echo "This will be the server and database password. You can change it in the node's .env settings"
echo "Choose a server password. (Default: '$CONFIG_MASTER_PASSWORD')"
read CONFIG_MASTER_PASSWORD

echo ""
echo "All ready to install. Do you want to continue the installation? (y,n)"
read answerConfirm

if [ "$CONFIG_MASTER_PASSWORD" == "" ]; then
    CONFIG_MASTER_PASSWORD="admin"
fi

if [ "$answerConfirm" == "y" ]; then
    echo "Installing node modules"
    cd ../
    npm install
    echo "[OK] Node modules installed!"

    cd ./deploy/templades

    sed -i "s|X_ADMIN_PASSWORD|$CONFIG_MASTER_PASSWORD|gi" node-env.conf
    echo "Node env updated!"

    mkdir ./temp
    cp 78station.service ./temp/78station.service && cp nginx-proxy.conf ./temp/nginx-proxy.conf && cp node-env.conf ./temp/node-env.conf && cp pg_default.conf ./temp/pg_default.conf && cp pg_hba.conf ./temp/pg_hba.conf
    cd ./temp

    mv node-env.conf .env
    mv .env ../../../.env

    echo "Setting up postgresql database"
    sudo -i -u postgres psql -c "ALTER USER postgres PASSWORD '$CONFIG_MASTER_PASSWORD';"
    sudo -i -u postgres createdb 78Station
    ufw allow from any to any port 5432 proto tcp
    systemctl restart postgresql
    echo "[OK] Postgresql configured!"

    echo "Setting up nginx config"
    mv nginx-proxy.conf 78station
    cp 78station /etc/nginx/sites-available/default
    mv 78station /etc/nginx/sites-enabled/default
    cp -r ../../../../78Station /var/www/78station
    ufw allow 80
    systemctl restart nginx
    echo "[OK] Nginx configured!"

    echo "Setting up 78Station App"
    mv 78station.service /etc/systemd/system/78station.service
    systemctl enable 78station.service && systemctl start 78station.service
    
    cd ../
    rm -rf ./temp

    echo "_________________________________________"
    echo ""
    echo "78Station successfull deployed! Thanks for choosing"
    echo "Node-Server listen: 127.0.0.1:5001"
    echo "PG-Server listen: 127.0.0.1:5432"
    echo "Nginx Proxy listen: [::]:80"
    echo "Postgresql DB password: $CONFIG_MASTER_PASSWORD"
    echo ""
fi


