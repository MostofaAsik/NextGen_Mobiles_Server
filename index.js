//Basic Requirement
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT || 5000

//middleware

app.use(express.json())
app.use(cors())





//create token
app.post('/authentication', async (req, res) => {
    const userEmail = req.body
    const token = jwt.sign(userEmail, process.env.ACCESS_TOKEN, { expiresIn: '10d' })
    res.send({ token })
})



//mongodb code will appear here

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rvjkksn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true, } });

async function run() {
    try {

        await client.connect();

        //server code will appear here
        const usersCollection = client.db('NextGen_Mobiles').collection('users')
        const productsCollection = client.db('NextGen_Mobiles').collection('products')



        //verify jwt
        const verifyJWT = (req, res, next) => {
            const authorization = req.headers.authorization
            if (!authorization) {
                return res.status(401).send({ error: true, message: 'Unauthorized Access - No Token Provided' });
            }
            const token = authorization.split(' ')[1]
            console.log(token);
            jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ error: true, message: 'Unauthorized Access - Invalid Token' });
                }
                req.decoded = decoded;
                next();
            });
        }
        //verify seller
        const verifySeller = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            console.log(query)
            try {
                const user = await usersCollection.findOne(query);
                console.log(user)
                if (user?.role !== 'seller') {
                    return res.status(403).send({ error: true, message: 'Forbidden - Not a Seller' });
                }
                next();
            } catch (error) {
                res.status(500).send({ error: true, message: 'Internal Server Error' });
            }
        }

        //verify admin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            try {
                const user = await usersCollection.findOne(query);
                if (user?.role !== 'admin') {
                    return res.status(403).send({ error: true, message: 'Forbidden - Not an Admin' });
                }
                next();
            } catch (error) {
                res.status(500).send({ error: true, message: 'Internal Server Error' });
            }
        }
        //all users get
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const users = await usersCollection.find().toArray();
                res.send(users);
            } catch (error) {
                res.status(500).send({ success: false, message: 'Failed to get users', error: error.message });
            }
        });




        //email based info
        app.get('/users/:email', async (req, res) => {
            const query = { email: req.params.email }
            const user = await usersCollection.findOne(query)
            res.send(user)
        })

        //users post
        app.post('/users', async (req, res) => {
            const user = req.body
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query)
            if (existingUser) {
                return res.send({ message: 'user already exist' })
            } else {
                const result = await usersCollection.insertOne(user)
                res.send(result)
            }
        })

        // specific id user delete
        app.delete('/users/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            try {
                const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
                if (result.deletedCount === 1) {
                    res.send({ success: true, message: 'User successfully deleted' });
                } else {
                    res.status(404).send({ success: false, message: 'User not found' });
                }
            } catch (error) {
                res.status(500).send({ success: false, message: 'Failed to delete user', error: error.message });
            }
        });

        //role update
        app.patch('/update-user-role/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { role } = req.body;

            const allowedRoles = ['buyer', 'seller', 'admin'];
            if (!allowedRoles.includes(role)) {
                return res.status(400).send({ success: false, message: 'Invalid role specified' });
            }

            try {
                const filter = { _id: new ObjectId(id) };
                const updateDoc = { $set: { role } };
                const result = await usersCollection.updateOne(filter, updateDoc);

                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: 'User role updated successfully' });
                } else {
                    res.status(404).send({ success: false, message: 'User not found or role is the same' });
                }
            } catch (error) {
                res.status(500).send({ success: false, message: 'Failed to update user role', error: error.message });
            }
        });


        //add-products
        app.post('/add-product', verifyJWT, verifySeller, async (req, res) => {
            const product = req.body
            const result = await productsCollection.insertOne(product)
            res.send(result)
        })
        //get user specific products
        app.get('/user/products', verifyJWT, verifySeller, async (req, res) => {
            const email = req.decoded.email;
            try {
                const products = await productsCollection.find({ email }).toArray();
                res.send(products);
            } catch (error) {
                res.status(500).send({ success: false, message: 'Failed to get products', error: error.message });
            }
        });

        //add wishlist
        //add wishlist
        app.patch('/wishlist', verifyJWT, async (req, res) => {
            const { userEmail, productId } = req.body;

            try {
                // Log the incoming data to check if everything is correct
                console.log('Received userEmail:', userEmail);
                console.log('Received productId:', productId);

                // Check if productId is valid ObjectId


                // Update wishlist
                const result = await usersCollection.updateOne(
                    { email: userEmail },
                    {
                        $addToSet: { wishList: new ObjectId(String(productId)) }
                    }
                );
                res.send(result)

            } catch (error) {
                console.error('Error adding product to wishlist:', error);
                res.status(500).send({ success: false, message: 'Failed to add to wishlist', error: error.message });
            }
        });

        //all products
        app.get('/all-products', async (req, res) => {
            const { title, sort, category, brand, page = 1, limit = 3 } = req.query
            const query = {}
            if (title) {
                query.title = { $regex: title, $options: 'i' }
            }
            if (category) {
                query.category = { $regex: category, $options: 'i' }
            }
            if (brand) {
                query.brand = brand
            }

            const currentPage = parseInt(page) || 1;
            const itemsPerPage = parseInt(limit) || 3;
            const skip = (currentPage - 1) * itemsPerPage;

            const sortOptions = sort === 'asc' ? 1 : -1
            const products = await productsCollection.find(query)
                .skip(skip)
                .limit(itemsPerPage)
                .sort({ price: sortOptions }).toArray()

            const productInfo = await productsCollection.find({}, { projection: { category: 1, brand: 1 } }).toArray()

            const totalProduct = await productsCollection.countDocuments(query);
            const brands = [...new Set(productInfo.map(product => product.brand))]
            const categories = [...new Set(productInfo.map(product => product.category))]
            res.send({ products, brands, categories, totalProduct })

        })


        // Update a specific product by the seller
        app.patch('/user/products/:id', verifyJWT, verifySeller, async (req, res) => {
            const productId = req.params.id;
            const email = req.decoded.email;
            const updates = req.body;

            try {

                const product = await productsCollection.findOne({ _id: new ObjectId(productId), email });


                if (!product) {
                    return res.status(403).send({ error: true, message: 'Forbidden - Product not found or you are not the owner' });
                }

                const filter = { _id: new ObjectId(productId), email };
                const updateDoc = { $set: updates };

                const result = await productsCollection.updateOne(filter, updateDoc);

                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: 'Product updated successfully' });
                } else {
                    res.status(404).send({ success: false, message: 'Product not found or no changes made' });
                }
            } catch (error) {
                res.status(500).send({ success: false, message: 'Failed to update product', error: error.message });
            }
        });




        // Delete seller-specific product
        app.delete('/user/products/:id', verifyJWT, verifySeller, async (req, res) => {
            const productId = req.params.id;
            const email = req.decoded.email;

            try {

                const product = await productsCollection.findOne({ _id: new ObjectId(productId), email });


                if (!product) {
                    return res.status(403).send({ error: true, message: 'Forbidden - Product not found or you are not the owner' });
                }


                const result = await productsCollection.deleteOne({ _id: new ObjectId(productId) });


                if (result.deletedCount === 1) {
                    res.send({ success: true, message: 'Product deleted successfully' });
                } else {
                    res.status(404).send({ success: false, message: 'Product not found' });
                }
            } catch (error) {
                res.status(500).send({ success: false, message: 'Failed to delete product', error: error.message });
            }
        });


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}

run().catch(console.dir);

// Simple Api's

app.get('/', (req, res) => {
    res.send('NextGen Mobiles Server is Running ')
})



app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})