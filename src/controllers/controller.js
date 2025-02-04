const User = require('../models/user.model');
const Join = require('../models/join.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');


// Create a nodemailer transporter for Outlook
const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com', // Outlook SMTP server
  port: 587, // Outlook SMTP port (587 or 465)
  secure: false, // TLS requires secure connection set to false
  auth: {
    user: process.env.EMAIL_USERNAME, // Your Outlook email address
    pass: process.env.EMAIL_PASSWORD // Your Outlook email password
  },
  tls: {
    rejectUnauthorized: false // Ignore SSL certificate verification
  }
});



const controller = {};

// Middleware to verify JWT token
controller.verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization;
 
    if (!token) return res.status(401).send({ message: 'Unauthorized' });

    const decodedToken = jwt.verify(token.split(" ")[1], process.env.JWT_SECRET);
    req.decodedToken = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying token:', error);
    return res.status(401).send({ message: 'Unauthorized' });
  }
};

// Middleware to verify admin privileges
controller.verifyAdmin = async (req, res, next) => {
  try {
    let token = req.headers.authorization; // Use 'authorization' instead of 'Authorization'
    if (!token) return res.status(401).send({ message: 'Unauthorized no token' });
    token=token.split(" ")[1]
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    req.decodedToken = decodedToken;
    if (decodedToken.userId !== process.env.ADMIN_ID) {

      return res.status(401).send({ message: 'Unauthorized admin' });
    }

    next();
  } catch (error) {
    console.error('Error verifying admin:', error);
    return res.status(401).send({ message: 'Unauthorized error' });
  }
};

// Function to generate a random join code
function generateJoinCode(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

// Controller to send join code via email
controller.sendJoinCodeByEmail = async (req, res) => {
  const receiver = req.body.receiver;
  const joinkey = generateJoinCode(6);

  try {
    const mailOptions = {
      from: process.env.EMAIL_USERNAME,
      to: receiver,
      subject: 'Your Join Code',
      text: `Your join code is: ${joinkey}`
    };

    await transporter.sendMail(mailOptions);
    const newJoin = new Join({ key: joinkey });
    await newJoin.save();

    res.send({ message: 'Join code sent successfully' });
  } catch (error) {
    console.error('Error sending join code:', error);
    res.status(500).send('An error occurred while sending the join code');
  }
};

// Controller to handle user signup
controller.signUp = async (req, res) => {
  try {
    const { join, email, password, firstName, lastName, dateNais, mobile } = req.body;

    if (!join || !email || !password || !firstName || !lastName || !dateNais || !mobile) {
      return res.status(400).send({ message: 'All fields are required' });
    }

    const joined = await Join.findOne({ key: join });
    if (!joined) {
      return res.status(400).send({ message: 'Invalid join code' });
    }

    // Remove the join document from the database
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).send({ message: 'Email already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const username = `${firstName.substring(0, 2)}${lastName.substring(0, 2)}${dateNais.substring(0, 2)}`;
    
    const newUser = new User({ email, password: hashedPassword, username, firstName, lastName, dateNais, mobile });
    const savedUser = await newUser.save();
    
    return res.status(201).send({
      message: "User created successfully",
      user: savedUser
    });
    await Join.findOneAndDelete({ key: join });
  } catch (error) {
    console.error('Error signing up:', error);
    return res.status(500).send("An error occurred while signing up.");
  }
};

// Controller to handle user login
controller.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const existingUser = await User.findOne({ username });
    if (!existingUser) {
      return res.status(404).send({ message: "User not found" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, existingUser.password);
    if (!isPasswordCorrect) {
      return res.status(401).send({ message: 'Invalid credentials' });
    }
//create token to connect
    const token = jwt.sign(
      { userId: existingUser._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.send({
      message: "Logged in successfully",
      token,
      isAdmin:existingUser._id==process.env.ADMIN_ID
    });
  } catch (error) {
    console.error('Error logging in:', error);
    return res.status(500).send("An error occurred while logging in.");
  }
};

// Controller to update user information


controller.updateUser = async (req, res) => {
  try {
    const { password, firstName, lastName, mobile, dateNais, email, username } = req.body;
    
    // Check if password is provided and hash it
    let hashedPassword;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Construct the updated user data object
    const updatedUserData = {};
    if (hashedPassword) updatedUserData.password = hashedPassword;
    if (firstName) updatedUserData.firstName = firstName;
    if (lastName) updatedUserData.lastName = lastName;
    if (mobile) updatedUserData.mobile = mobile;
    if (dateNais) updatedUserData.dateNais = dateNais;
    if (email) updatedUserData.email = email;
    if (username) updatedUserData.username = username;

    // Update the user document in the database
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updatedUserData,
      { new: true }
    );

    // Check if user document was found and updated
    if (!updatedUser) {
      return res.status(404).send({ message: "User not found" });
    }

    // Send response with updated user data
    res.send({ message: "User updated successfully", user: updatedUser });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).send("An error occurred while updating user.");
  }
};



// Controller to retrieve all users
controller.getAllUsers = async (req, res) => {
  try {
    const allUsers = await User.find({ username: { $ne: "admin" } });
    res.json(allUsers);
  } catch (error) {
    console.error('Error getting all users:', error);
    res.status(500).send("An error occurred while retrieving users.");
  }
};


// Controller to delete a user
controller.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }
    await User.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).send("An error occurred while deleting user.");
  }
};

module.exports = controller;
