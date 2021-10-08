exports.handler = async(event, context, callback) => {
    const output = event.records.map((record) => {
        const data = Buffer.from(record.data, 'base64').toString('utf8');
        const payload = {
            "logs": data
        }
        const stringVersion = JSON.stringify(payload);    
        const encodedData = (Buffer.from(stringVersion)).toString('base64');
        return {
            recordId: record.recordId,
            result: 'Ok',
            data: encodedData
        };
    });

    callback(null, { records: output });
};